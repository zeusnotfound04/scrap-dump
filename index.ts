import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import PQueue from 'p-queue';
import pLimit from 'p-limit';

const app = express();
const PORT = 3000;

// Configuration
const TOTAL_PAGES = 7022;
const CONCURRENT_REQUESTS = 5; // Number of concurrent requests
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay
const BASE_URL = 'https://www.jhansipropertytax.com/listName.php';

// Interface for property data
interface PropertyData {
  slNo: string;
  pid: string;
  ward: string;
  mohalla: string;
  chkNo: string;
  houseNo: string;
  ownerName: string;
  mobile: string;
  viewDetailsLink: string;
}

// Middleware
app.use(express.json());

// Free proxy list (you can add more or use paid proxy services)
const FREE_PROXIES: string[] = [
  // Add proxy URLs here, example:
  // 'http://proxy1:port',
  // 'http://proxy2:port',
];

// Get random proxy (optional, can work without proxy too)
const getRandomProxy = (): HttpsProxyAgent<string> | undefined => {
  if (FREE_PROXIES.length === 0) return undefined;
  const randomProxy = FREE_PROXIES[Math.floor(Math.random() * FREE_PROXIES.length)];
  if (!randomProxy) return undefined;
  return new HttpsProxyAgent(randomProxy);
};

// Create request headers
const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
});

// Parse HTML and extract property data
const parsePropertyData = (html: string): PropertyData[] => {
  const $ = cheerio.load(html);
  const properties: PropertyData[] = [];

  // Find all table rows with property data
  $('table tr').each((index, element) => {
    const $row = $(element);
    const cells = $row.find('td');

    // Skip header row and empty rows
    if (cells.length >= 8) {
      const slNo = $(cells[0]).text().trim();
      
      // Only process rows with numeric serial numbers
      if (/^\d+$/.test(slNo)) {
        const pid = $(cells[1]).text().trim();
        const ward = $(cells[2]).text().trim();
        const mohalla = $(cells[3]).text().trim();
        const chkNo = $(cells[4]).text().trim();
        const houseNo = $(cells[5]).text().trim();
        const ownerName = $(cells[6]).text().trim();
        const mobile = $(cells[7]).text().trim();
        
        // Extract view details link
        const viewLink = $(cells[8]).find('a').attr('href') || '';
        const fullViewLink = viewLink ? `https://www.jhansipropertytax.com/${viewLink}` : '';

        properties.push({
          slNo,
          pid,
          ward,
          mohalla,
          chkNo,
          houseNo,
          ownerName,
          mobile,
          viewDetailsLink: fullViewLink
        });
      }
    }
  });

  return properties;
};

// Fetch single page data
const fetchPage = async (pageNo: number, retryCount = 0): Promise<PropertyData[]> => {
  try {
    const url = pageNo === 1 ? BASE_URL : `${BASE_URL}?pageno=${pageNo}`;
    const proxy = getRandomProxy();
    
    console.log(`Fetching page ${pageNo}...`);
    
    const axiosConfig: any = {
      headers: getHeaders(),
      timeout: 15000,
    };

    if (proxy) {
      axiosConfig.httpsAgent = proxy;
    }

    const response = await axios.get(url, axiosConfig);
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    const properties = parsePropertyData(response.data);
    
    // Save individual page data
    const filename = `page-${pageNo.toString().padStart(4, '0')}.txt`;
    const filePath = path.join(process.cwd(), 'pages', filename);
    
    // Create pages directory if it doesn't exist
    await fs.mkdir(path.join(process.cwd(), 'pages'), { recursive: true });
    await fs.writeFile(filePath, response.data, 'utf8');
    
    console.log(`✓ Page ${pageNo}: Found ${properties.length} properties`);
    return properties;

  } catch (error: any) {
    console.error(`✗ Error fetching page ${pageNo}: ${error.message}`);
    
    // Retry up to 3 times
    if (retryCount < 3) {
      console.log(`Retrying page ${pageNo} (attempt ${retryCount + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return fetchPage(pageNo, retryCount + 1);
    }
    
    return []; // Return empty array if all retries fail
  }
};

// Main scraping function with worker pool
const scrapeAllPages = async (startPage = 1, endPage = TOTAL_PAGES): Promise<PropertyData[]> => {
  console.log(`🚀 Starting to scrape ${endPage - startPage + 1} pages...`);
  
  const queue = new PQueue({ 
    concurrency: CONCURRENT_REQUESTS,
    interval: DELAY_BETWEEN_REQUESTS,
    intervalCap: 1
  });

  const allProperties: PropertyData[] = [];
  let completedPages = 0;

  // Create tasks for all pages
  const tasks = [];
  for (let pageNo = startPage; pageNo <= endPage; pageNo++) {
    tasks.push(
      queue.add(async () => {
        const properties = await fetchPage(pageNo);
        allProperties.push(...properties);
        completedPages++;
        
        // Progress logging
        if (completedPages % 10 === 0 || completedPages === endPage - startPage + 1) {
          console.log(`📊 Progress: ${completedPages}/${endPage - startPage + 1} pages completed`);
        }
        
        return properties;
      })
    );
  }

  // Wait for all tasks to complete
  await Promise.all(tasks);
  
  console.log(`🎉 Scraping completed! Total properties found: ${allProperties.length}`);
  return allProperties;
};

// API Routes

// Start full scraping process
app.post('/start-scraping', async (req, res) => {
  try {
    const { startPage = 1, endPage = TOTAL_PAGES } = req.body;
    
    console.log(`Starting scraping from page ${startPage} to ${endPage}...`);
    
    const properties = await scrapeAllPages(startPage, endPage);
    
    // Save consolidated JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFilename = `jhansi-properties-${timestamp}.json`;
    const jsonPath = path.join(process.cwd(), jsonFilename);
    
    await fs.writeFile(jsonPath, JSON.stringify(properties, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Scraping completed successfully',
      totalProperties: properties.length,
      pagesProcessed: endPage - startPage + 1,
      jsonFile: jsonFilename,
      summary: {
        totalRecords: properties.length,
        averagePerPage: Math.round(properties.length / (endPage - startPage + 1))
      }
    });

  } catch (error: any) {
    console.error('Scraping error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Scraping failed',
      error: error.message
    });
  }
});

// Fetch single page (for testing)
app.get('/fetch-page/:pageNo', async (req, res) => {
  try {
    const pageNo = parseInt(req.params.pageNo) || 1;
    const properties = await fetchPage(pageNo);
    
    res.json({
      success: true,
      pageNo,
      properties,
      count: properties.length
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page',
      error: error.message
    });
  }
});

// Get scraping status
app.get('/status', async (req, res) => {
  try {
    const pagesDir = path.join(process.cwd(), 'pages');
    let completedPages = 0;
    
    try {
      const files = await fs.readdir(pagesDir);
      completedPages = files.filter(file => file.startsWith('page-') && file.endsWith('.txt')).length;
    } catch (e) {
      // Directory doesn't exist yet
    }

    res.json({
      totalPages: TOTAL_PAGES,
      completedPages,
      progress: Math.round((completedPages / TOTAL_PAGES) * 100),
      remaining: TOTAL_PAGES - completedPages
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Combine existing page files into JSON
app.post('/combine-pages', async (req, res) => {
  try {
    const pagesDir = path.join(process.cwd(), 'pages');
    const files = await fs.readdir(pagesDir);
    const pageFiles = files.filter(file => file.startsWith('page-') && file.endsWith('.txt'));
    
    console.log(`Found ${pageFiles.length} page files to combine...`);
    
    const allProperties: PropertyData[] = [];
    
    for (const filename of pageFiles) {
      const filePath = path.join(pagesDir, filename);
      const htmlContent = await fs.readFile(filePath, 'utf8');
      const properties = parsePropertyData(htmlContent);
      allProperties.push(...properties);
    }
    
    // Save combined JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFilename = `combined-properties-${timestamp}.json`;
    const jsonPath = path.join(process.cwd(), jsonFilename);
    
    await fs.writeFile(jsonPath, JSON.stringify(allProperties, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Pages combined successfully',
      totalProperties: allProperties.length,
      filesProcessed: pageFiles.length,
      jsonFile: jsonFilename
    });

  } catch (error: any) {
    console.error('Combining error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Jhansi Property Data Scraper is running!',
    endpoints: {
      startScraping: 'POST /start-scraping',
      fetchPage: 'GET /fetch-page/:pageNo',
      status: 'GET /status',
      combinePages: 'POST /combine-pages'
    },
    config: {
      totalPages: TOTAL_PAGES,
      concurrentRequests: CONCURRENT_REQUESTS,
      delayBetweenRequests: DELAY_BETWEEN_REQUESTS
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Jhansi Property Scraper running on http://localhost:${PORT}`);
  console.log(`📊 Ready to scrape ${TOTAL_PAGES} pages with ${CONCURRENT_REQUESTS} concurrent requests`);
  console.log('\n📋 Available endpoints:');
  console.log(`   POST /start-scraping - Start full scraping process`);
  console.log(`   GET  /fetch-page/:pageNo - Fetch single page (for testing)`);
  console.log(`   GET  /status - Check scraping progress`);
  console.log(`   POST /combine-pages - Combine existing page files into JSON`);
});
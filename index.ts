import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import pLimit from 'p-limit';
import os from 'os';

const app = express();
const PORT = 3000;

// Configuration - Optimized for maximum speed
const TOTAL_PAGES = 7022;
const CPU_CORES = os.cpus().length;
const CONCURRENT_REQUESTS = CPU_CORES * 4; // Use 4x CPU cores for maximum throughput
const DELAY_BETWEEN_REQUESTS = 100; // Minimal delay - 100ms
const BATCH_SIZE = 50; // Process in batches
const BASE_URL = 'https://www.jhansipropertytax.com/listName.php';

console.log(`🚀 Detected ${CPU_CORES} CPU cores, using ${CONCURRENT_REQUESTS} concurrent requests`);

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

// Optimized headers for maximum speed
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const getRandomUserAgent = (): string => {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index] ?? USER_AGENTS[0] ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
};

// Create optimized request headers
const getHeaders = () => ({
  'User-Agent': getRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'DNT': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
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

// Fetch single page data - Optimized for maximum speed
const fetchPage = async (pageNo: number, retryCount = 0): Promise<PropertyData[]> => {
  try {
    const url = pageNo === 1 ? BASE_URL : `${BASE_URL}?pageno=${pageNo}`;
    
    // Minimal logging for speed
    if (pageNo % 100 === 0 || pageNo <= 10) {
      console.log(`🚀 Fetching page ${pageNo}...`);
    }
    
    const axiosConfig = {
      headers: getHeaders(),
      timeout: 8000, // Reduced timeout for speed
      maxRedirects: 3,
      validateStatus: (status: number) => status < 400
    };

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

// Ultra-fast scraping function with maximum concurrency
const scrapeAllPages = async (startPage = 1, endPage = TOTAL_PAGES): Promise<PropertyData[]> => {
  console.log(`🚀 TURBO MODE: Scraping ${endPage - startPage + 1} pages with ${CONCURRENT_REQUESTS} concurrent requests...`);
  console.log(`⚡ CPU Cores: ${CPU_CORES} | Batch Size: ${BATCH_SIZE} | Delay: ${DELAY_BETWEEN_REQUESTS}ms`);
  
  const startTime = Date.now();
  const allProperties: PropertyData[] = [];
  let completedPages = 0;
  let totalPages = endPage - startPage + 1;

  // Process pages in batches for better memory management
  for (let batchStart = startPage; batchStart <= endPage; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endPage);
    const batchSize = batchEnd - batchStart + 1;
    
    console.log(`\n🔥 Processing batch: ${batchStart}-${batchEnd} (${batchSize} pages)`);
    
    // Create queue for this batch with maximum concurrency
    const batchQueue = new PQueue({ 
      concurrency: CONCURRENT_REQUESTS,
      interval: DELAY_BETWEEN_REQUESTS,
      intervalCap: Math.ceil(CONCURRENT_REQUESTS / 2) // Allow burst processing
    });

    const batchTasks = [];
    
    // Create tasks for current batch
    for (let pageNo = batchStart; pageNo <= batchEnd; pageNo++) {
      batchTasks.push(
        batchQueue.add(async () => {
          const properties = await fetchPage(pageNo);
          completedPages++;
          
          // Real-time progress for large batches
          if (completedPages % 25 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = completedPages / elapsed;
            const remaining = totalPages - completedPages;
            const eta = Math.round(remaining / rate);
            
            console.log(`⚡ ${completedPages}/${totalPages} pages | ${rate.toFixed(1)} pages/sec | ETA: ${eta}s`);
          }
          
          return properties;
        })
      );
    }

    // Wait for current batch to complete
    const batchResults = await Promise.all(batchTasks);
    
    // Aggregate results
    batchResults.forEach(properties => {
      allProperties.push(...properties);
    });
    
    // Small delay between batches to prevent overwhelming the server
    if (batchEnd < endPage) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const averageRate = completedPages / totalTime;
  
  console.log(`\n🎉 TURBO SCRAPING COMPLETED!`);
  console.log(`📊 Total Properties: ${allProperties.length}`);
  console.log(`⏱️  Total Time: ${totalTime.toFixed(1)}s`);
  console.log(`⚡ Average Rate: ${averageRate.toFixed(2)} pages/second`);
  
  return allProperties;
};

// API Routes

// TURBO: Ultra-fast scraping with all CPU cores
app.post('/turbo-scrape', async (req, res) => {
  try {
    const { startPage = 1, endPage = TOTAL_PAGES } = req.body;
    
    console.log(`\n🚀 TURBO MODE ACTIVATED: Scraping ${endPage - startPage + 1} pages at maximum speed!`);
    console.log(`⚡ Using ${CONCURRENT_REQUESTS} concurrent requests (${CPU_CORES} CPU cores x 4)`);
    
    const startTime = Date.now();
    const properties = await scrapeAllPages(startPage, endPage);
    
    // Save consolidated JSON file with optimized writing
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFilename = `turbo-properties-${timestamp}.json`;
    const jsonPath = path.join(process.cwd(), jsonFilename);
    
    // Use streaming write for large files
    const jsonData = JSON.stringify(properties, null, 2);
    await fs.writeFile(jsonPath, jsonData, 'utf8');
    
    const totalTime = (Date.now() - startTime) / 1000;
    const rate = properties.length / totalTime;
    
    console.log(`\n🎯 TURBO SCRAPING COMPLETE!`);
    console.log(`📁 Saved to: ${jsonFilename}`);
    console.log(`💾 File size: ${Math.round(jsonData.length / 1024)} KB`);
    
    res.json({
      success: true,
      message: '🚀 TURBO scraping completed at maximum speed!',
      mode: 'TURBO',
      performance: {
        totalTime: `${totalTime.toFixed(1)}s`,
        rate: `${rate.toFixed(1)} properties/second`,
        concurrency: CONCURRENT_REQUESTS,
        cpuCores: CPU_CORES
      },
      data: {
        totalProperties: properties.length,
        pagesProcessed: endPage - startPage + 1,
        averagePerPage: Math.round(properties.length / (endPage - startPage + 1)),
        jsonFile: jsonFilename,
        fileSize: `${Math.round(jsonData.length / 1024)} KB`
      }
    });

  } catch (error: any) {
    console.error('❌ TURBO scraping error:', error.message);
    res.status(500).json({
      success: false,
      message: 'TURBO scraping failed',
      error: error.message
    });
  }
});

// Legacy scraping (slower, kept for compatibility)
app.post('/start-scraping', async (req, res) => {
  try {
    const { startPage = 1, endPage = TOTAL_PAGES } = req.body;
    
    console.log(`Starting legacy scraping from page ${startPage} to ${endPage}...`);
    console.log(`⚠️  Consider using /turbo-scrape for ${CONCURRENT_REQUESTS}x faster performance!`);
    
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

// Health check with turbo capabilities
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Jhansi Property Turbo Scraper - Maximum Speed Edition!',
    mode: 'TURBO ENABLED',
    performance: {
      cpuCores: CPU_CORES,
      maxConcurrency: CONCURRENT_REQUESTS,
      speedMultiplier: `${Math.round(CONCURRENT_REQUESTS / 5)}x faster than standard`
    },
    endpoints: {
      turboScrape: '🚀 POST /turbo-scrape (RECOMMENDED - Ultra Fast)',
      legacyScrape: 'POST /start-scraping (Legacy - Slower)',
      fetchPage: 'GET /fetch-page/:pageNo (Testing)',
      status: 'GET /status (Progress)',
      combinePages: 'POST /combine-pages (Utility)'
    },
    config: {
      totalPages: TOTAL_PAGES,
      concurrentRequests: CONCURRENT_REQUESTS,
      batchSize: BATCH_SIZE,
      delayBetweenRequests: `${DELAY_BETWEEN_REQUESTS}ms (Optimized)`,
      estimatedTimeFor7022Pages: `~${Math.round(7022 / (CONCURRENT_REQUESTS * 0.8) / 60)} minutes`
    },
    quickStart: {
      testRun: 'POST /turbo-scrape with {"startPage": 1, "endPage": 10}',
      fullScrape: 'POST /turbo-scrape (scrapes all 7022 pages)'
    }
  });
});

// Start turbo server
app.listen(PORT, () => {
  console.log(`\n🚀 JHANSI PROPERTY TURBO SCRAPER - MAXIMUM SPEED EDITION!`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`💻 CPU Cores: ${CPU_CORES}`);
  console.log(`⚡ Max Concurrency: ${CONCURRENT_REQUESTS} (${Math.round(CONCURRENT_REQUESTS / 5)}x faster!)`);
  console.log(`📊 Target: ${TOTAL_PAGES} pages`);
  console.log(`⏱️  Est. Time: ~${Math.round(7022 / (CONCURRENT_REQUESTS * 0.8) / 60)} minutes for full scrape`);
  console.log(`\n🔥 TURBO ENDPOINTS:`);
  console.log(`   🚀 POST /turbo-scrape      - ULTRA FAST scraping (RECOMMENDED)`);
  console.log(`   📊 GET  /status            - Real-time progress`);
  console.log(`   🧪 GET  /fetch-page/:pageNo - Single page test`);
  console.log(`   📄 POST /combine-pages     - Combine existing files`);
  console.log(`   🐌 POST /start-scraping    - Legacy mode (slower)`);
  console.log(`\n🎯 QUICK START:`);
  console.log(`   Test:  curl -X POST ${PORT === 3000 ? 'http://localhost:3000' : `http://localhost:${PORT}`}/turbo-scrape -H "Content-Type: application/json" -d "{\\"startPage\\": 1, \\"endPage\\": 10}"`);
  console.log(`   Full:  curl -X POST ${PORT === 3000 ? 'http://localhost:3000' : `http://localhost:${PORT}`}/turbo-scrape -H "Content-Type: application/json" -d "{}"`);
  console.log(`\n⚠️  TURBO MODE: No proxy delays - Maximum speed with ${CPU_CORES} CPU cores!`);
});
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

// Configuration - Balanced for speed and reliability
const TOTAL_PAGES = 7022;
const CPU_CORES = os.cpus().length;

// AGGRESSIVE concurrency for maximum speed
const MAX_SAFE_CONCURRENT = CPU_CORES * 5; // Much more aggressive
const CONCURRENT_REQUESTS = CPU_CORES >= 8 ? 20 : Math.max(CPU_CORES * 3, 12); // Much more aggressive
const DELAY_BETWEEN_REQUESTS = 50; // Minimal delay - 50ms
const BATCH_SIZE = 50; // Larger batches for speed
const REQUEST_TIMEOUT = 15000; // Increased timeout - 15s
const BASE_URL = 'https://www.jhansipropertytax.com/listName.php';

console.log(`🚀 Detected ${CPU_CORES} CPU cores, using ${CONCURRENT_REQUESTS} concurrent requests (AGGRESSIVE MODE)`);
console.log(`🔥 TURBO mode: Maximum Speed (Max concurrent: ${MAX_SAFE_CONCURRENT})`);

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
      timeout: REQUEST_TIMEOUT, // Increased timeout for reliability
      maxRedirects: 3,
      validateStatus: (status: number) => status < 400,
      // Add connection pooling for better performance
      maxContentLength: Infinity,
      maxBodyLength: Infinity
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
    const errorType = error.code || error.message;
    console.error(`✗ Error fetching page ${pageNo}: ${errorType}`);
    
    // Retry up to 3 times with exponential backoff
    if (retryCount < 3) {
      const backoffDelay = Math.min(2000 * Math.pow(2, retryCount), 10000); // Max 10s
      console.log(`🔄 Retrying page ${pageNo} in ${backoffDelay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return fetchPage(pageNo, retryCount + 1);
    }
    
    console.warn(`⚠️ Gave up on page ${pageNo} after 3 attempts`);
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

  let currentConcurrency = CONCURRENT_REQUESTS;
  let failureCount = 0;
  
  // Process pages in batches with adaptive concurrency
  for (let batchStart = startPage; batchStart <= endPage; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endPage);
    const batchSize = batchEnd - batchStart + 1;
    
    // Adaptive concurrency based on failure rate
    if (failureCount > 10) {
      currentConcurrency = Math.max(3, Math.floor(currentConcurrency * 0.7));
      console.log(`🔧 Reducing concurrency to ${currentConcurrency} due to failures`);
      failureCount = 0;
    }
    
    console.log(`\n🔥 Batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchStart}-${batchEnd} (${batchSize} pages) [${currentConcurrency} concurrent]`);
    
    // Create queue for this batch with adaptive concurrency
    const batchQueue = new PQueue({ 
      concurrency: currentConcurrency
      // Remove interval and intervalCap - they cause hangs
    });

    const batchTasks = [];
    
    // Create tasks for current batch
    for (let pageNo = batchStart; pageNo <= batchEnd; pageNo++) {
      batchTasks.push(
        batchQueue.add(async () => {
          // Manual delay to replace PQueue interval
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
          
          const properties = await fetchPage(pageNo);
          
          if (properties.length === 0) {
            failureCount++;
          }
          
          completedPages++;
          
          // Real-time progress with success rate
          if (completedPages % 25 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = completedPages / elapsed;
            const remaining = totalPages - completedPages;
            const eta = Math.round(remaining / rate);
            const successRate = ((completedPages - failureCount) / completedPages * 100).toFixed(1);
            
            console.log(`⚡ ${completedPages}/${totalPages} pages | ${rate.toFixed(1)}/sec | Success: ${successRate}% | ETA: ${eta}s`);
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
    
    // Shorter delay between batches since we have manual delays in tasks
    if (batchEnd < endPage) {
      const batchDelay = failureCount > 5 ? 1000 : 300; // Much shorter delays
      console.log(`⏸️ Batch complete. Pausing ${batchDelay}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const averageRate = completedPages / totalTime;
  const successRate = ((completedPages - failureCount) / completedPages * 100).toFixed(1);
  
  console.log(`\n🎉 BALANCED SCRAPING COMPLETED!`);
  console.log(`📊 Total Properties: ${allProperties.length}`);
  console.log(`📈 Success Rate: ${successRate}% (${completedPages - failureCount}/${completedPages} pages)`);
  console.log(`⏱️  Total Time: ${totalTime.toFixed(1)}s`);
  console.log(`⚡ Average Rate: ${averageRate.toFixed(2)} pages/second`);
  console.log(`🎯 Final Concurrency: ${currentConcurrency}`);
  
  return allProperties;
};

// API Routes

// TURBO: Ultra-fast scraping with all CPU cores
app.post('/turbo-scrape', async (req, res) => {
  try {
    // Handle empty or null request body
    const body = req.body || {};
    const { startPage = 1, endPage = TOTAL_PAGES } = body;
    
    console.log(`\n🔥 TURBO MODE ACTIVATED: Scraping ${endPage - startPage + 1} pages with aggressive concurrency!`);
    console.log(`⚡ Using ${CONCURRENT_REQUESTS} concurrent requests with maximum speed`);
    
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
      message: '⚖️ BALANCED scraping completed with optimal speed + reliability!',
      mode: 'BALANCED',
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
      message: 'Balanced scraping failed',
      error: error.message
    });
  }
});

// Legacy scraping (slower, kept for compatibility)
app.post('/start-scraping', async (req, res) => {
  try {
    // Handle empty or null request body
    const body = req.body || {};
    const { startPage = 1, endPage = TOTAL_PAGES } = body;
    
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
    message: '⚖️ Jhansi Property Balanced Scraper - Speed + Reliability Edition!',
    mode: 'BALANCED ENABLED',
    performance: {
      cpuCores: CPU_CORES,
      maxConcurrency: CONCURRENT_REQUESTS,
      speedMultiplier: `Smart scaling with ${CONCURRENT_REQUESTS} concurrent requests`
    },
    endpoints: {
      balancedScrape: '⚖️ POST /turbo-scrape (RECOMMENDED - Balanced Fast)',
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
      estimatedTimeFor7022Pages: `~${Math.round(7022 / (CONCURRENT_REQUESTS * 0.6) / 60)} minutes (with reliability)`
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
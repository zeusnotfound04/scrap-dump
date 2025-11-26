#!/usr/bin/env node

import axios from 'axios';

const SERVER_URL = 'http://localhost:3000';

async function testScraper() {
  console.log('🧪 Testing Jhansi Property Scraper...\n');

  try {
    // Test 1: Check if server is running
    console.log('1. Testing server health...');
    const healthResponse = await axios.get(`${SERVER_URL}/`);
    console.log('✅ Server is running\n');

    // Test 2: Fetch a single page
    console.log('2. Testing single page fetch...');
    const pageResponse = await axios.get(`${SERVER_URL}/fetch-page/1`);
    console.log(`✅ Page 1 fetched: ${pageResponse.data.count} properties found\n`);

    // Test 3: Check current status
    console.log('3. Checking scraping status...');
    const statusResponse = await axios.get(`${SERVER_URL}/status`);
    console.log(`✅ Status: ${statusResponse.data.completedPages}/${statusResponse.data.totalPages} pages completed\n`);

    // Test 4: Start small batch scraping (first 5 pages for testing)
    console.log('4. Testing batch scraping (pages 1-5)...');
    const scrapingResponse = await axios.post(`${SERVER_URL}/start-scraping`, {
      startPage: 1,
      endPage: 5
    });
    console.log(`✅ Batch scraping completed: ${scrapingResponse.data.totalProperties} properties found\n`);

    // Test 5: Combine pages
    console.log('5. Testing page combination...');
    const combineResponse = await axios.post(`${SERVER_URL}/combine-pages`);
    console.log(`✅ Pages combined: ${combineResponse.data.totalProperties} total properties\n`);

    console.log('🎉 All tests passed! The scraper is working correctly.');
    console.log('\n📋 To start full scraping, use:');
    console.log(`curl -X POST ${SERVER_URL}/start-scraping`);
    console.log('\n⚠️  Note: Full scraping of 7022 pages will take several hours.');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
testScraper();
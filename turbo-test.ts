#!/usr/bin/env node

import axios from 'axios';

const SERVER_URL = 'http://localhost:3000';

async function turboTest() {
  console.log('🚀 Testing TURBO Jhansi Property Scraper...\n');

  try {
    // Test 1: Check turbo server
    console.log('1. 🔥 Testing TURBO server...');
    const healthResponse = await axios.get(`${SERVER_URL}/`);
    console.log('✅ TURBO Server is running');
    console.log(`⚡ Detected: ${healthResponse.data.performance?.cpuCores} CPU cores`);
    console.log(`🚀 Max Concurrency: ${healthResponse.data.performance?.maxConcurrency}\n`);

    // Test 2: Single page turbo fetch
    console.log('2. 🧪 Testing single page turbo fetch...');
    const pageStart = Date.now();
    const pageResponse = await axios.get(`${SERVER_URL}/fetch-page/1`);
    const pageTime = Date.now() - pageStart;
    console.log(`✅ Page 1 fetched in ${pageTime}ms: ${pageResponse.data.count} properties\n`);

    // Test 3: Small batch turbo scraping
    console.log('3. ⚡ Testing TURBO batch scraping (5 pages)...');
    const turboStart = Date.now();
    
    const turboResponse = await axios.post(`${SERVER_URL}/turbo-scrape`, {
      startPage: 1,
      endPage: 5
    });
    
    const turboTime = Date.now() - turboStart;
    console.log(`✅ TURBO batch completed in ${turboTime}ms!`);
    console.log(`📊 Properties found: ${turboResponse.data.data?.totalProperties}`);
    console.log(`⚡ Rate: ${turboResponse.data.performance?.rate}`);
    console.log(`💾 File: ${turboResponse.data.data?.jsonFile}\n`);

    // Test 4: Performance comparison
    console.log('4. 📈 Performance analysis...');
    const avgTimePerPage = turboTime / 5;
    const estimatedFullTime = (avgTimePerPage * 7022) / 1000 / 60; // minutes
    console.log(`⏱️  Average time per page: ${avgTimePerPage.toFixed(0)}ms`);
    console.log(`🎯 Estimated time for 7022 pages: ${estimatedFullTime.toFixed(1)} minutes\n`);

    // Test 5: Status check
    console.log('5. 📊 Checking status...');
    const statusResponse = await axios.get(`${SERVER_URL}/status`);
    console.log(`✅ Pages completed: ${statusResponse.data.completedPages}/${statusResponse.data.totalPages}\n`);

    console.log('🎉 TURBO MODE TESTS PASSED! Ready for high-speed scraping!');
    console.log('\n🚀 TURBO COMMANDS:');
    console.log(`   Small batch:  curl -X POST ${SERVER_URL}/turbo-scrape -H "Content-Type: application/json" -d "{\\"startPage\\": 1, \\"endPage\\": 100}"`);
    console.log(`   Medium batch: curl -X POST ${SERVER_URL}/turbo-scrape -H "Content-Type: application/json" -d "{\\"startPage\\": 1, \\"endPage\\": 1000}"`);
    console.log(`   FULL SCRAPE:  curl -X POST ${SERVER_URL}/turbo-scrape -H "Content-Type: application/json" -d "{}"`);
    console.log('\n⚠️  TURBO MODE: Maximum speed - No delays, all CPU cores engaged!');

  } catch (error: any) {
    console.error('❌ TURBO Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure to start the server first: bun run start');
    }
    process.exit(1);
  }
}

// Run turbo tests
turboTest();
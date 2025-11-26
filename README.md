# Jhansi Property Tax Data Scraper

A comprehensive Node.js/Bun application for scraping property data from the Jhansi Municipal Corporation property tax website with advanced features including pagination, proxy support, worker pools, and data aggregation.

## Features

- ✅ **Pagination Support**: Automatically handles all 7022 pages
- ✅ **Proxy Support**: Hide your IP using proxy servers
- ✅ **Worker Pools**: Concurrent processing for faster scraping
- ✅ **Rate Limiting**: Respectful scraping with delays
- ✅ **Error Handling**: Automatic retries and graceful error handling
- ✅ **Data Extraction**: Clean JSON output with structured property data
- ✅ **Progress Tracking**: Real-time progress monitoring
- ✅ **Resume Capability**: Can resume interrupted scraping sessions

## Installation

```bash
# Install dependencies
bun install

# Or with npm
npm install
```

## Configuration

### Proxy Setup (Optional)
Edit `index.ts` and add your proxy URLs to the `FREE_PROXIES` array:

```typescript
const FREE_PROXIES: string[] = [
  'http://proxy1:port',
  'http://proxy2:port',
  // Add more proxies here
];
```

### Scraping Settings
- `TOTAL_PAGES`: 7022 (total pages to scrape)
- `CONCURRENT_REQUESTS`: 5 (concurrent requests)
- `DELAY_BETWEEN_REQUESTS`: 1000ms (delay between requests)

## Usage

### 1. Start the Server
```bash
bun run start
# Server starts on http://localhost:3000
```

### 2. Run Tests
```bash
bun run test-scraper.ts
```

### 3. API Endpoints

#### Health Check
```bash
GET http://localhost:3000/
```

#### Fetch Single Page (Testing)
```bash
GET http://localhost:3000/fetch-page/1
```

#### Start Full Scraping
```bash
POST http://localhost:3000/start-scraping
Content-Type: application/json

{
  "startPage": 1,
  "endPage": 7022
}
```

#### Start Partial Scraping
```bash
POST http://localhost:3000/start-scraping
Content-Type: application/json

{
  "startPage": 1,
  "endPage": 100
}
```

#### Check Progress
```bash
GET http://localhost:3000/status
```

#### Combine Existing Pages
```bash
POST http://localhost:3000/combine-pages
```

## Data Structure

The scraper extracts the following fields from each property:

```json
{
  "slNo": "1",
  "pid": "1/14/13117",
  "ward": "HANSARI GIRD FIRST",
  "mohalla": "HANSARI GIRD",
  "chkNo": "14",
  "houseNo": "1",
  "ownerName": "Mr.ANITA KUMARI W/O DEVENDRA KUMAR SINGH",
  "mobile": "000****000",
  "viewDetailsLink": "https://www.jhansipropertytax.com/detailsByPropnonew.php?property_no=1/14/13117"
}
```

## File Structure

```
├── index.ts                    # Main scraper application
├── scraper-worker.ts          # Worker for parallel processing
├── test-scraper.ts           # Test script
├── package.json              # Dependencies
├── pages/                    # Individual page HTML files
│   ├── page-0001.txt
│   ├── page-0002.txt
│   └── ...
└── jhansi-properties-*.json  # Final aggregated JSON files
```

## Performance

- **Speed**: ~5 pages per minute (with rate limiting)
- **Memory**: Low memory footprint with streaming
- **Resumable**: Can resume from any page number
- **Concurrent**: Processes multiple pages simultaneously

## Time Estimates

- **100 pages**: ~20 minutes
- **1000 pages**: ~3.5 hours
- **7022 pages**: ~24 hours

## Best Practices

1. **Start Small**: Test with 10-50 pages first
2. **Use Proxies**: For large-scale scraping
3. **Monitor Progress**: Check `/status` endpoint regularly
4. **Resume if Needed**: Use existing page files to continue

## Troubleshooting

### Server Not Starting
```bash
# Check if port 3000 is available
netstat -an | findstr :3000

# Kill existing process if needed
taskkill /f /im node.exe
```

### Scraping Errors
- Check internet connection
- Verify proxy settings
- Reduce concurrent requests
- Increase delays between requests

### Memory Issues
- Reduce `CONCURRENT_REQUESTS`
- Increase system memory
- Process in smaller batches

## Legal Notice

⚠️ **Important**: This scraper is for educational purposes. Please ensure you comply with the website's terms of service and applicable laws. Always scrape responsibly and respectfully.

## License

MIT License - Use at your own risk.

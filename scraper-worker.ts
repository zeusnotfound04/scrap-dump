// Worker file for parallel HTML parsing
import * as cheerio from 'cheerio';

export interface PropertyData {
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

// Parse HTML and extract property data (worker function)
export const parsePropertyDataWorker = (html: string): PropertyData[] => {
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

// Export for Piscina worker pool
export default parsePropertyDataWorker;
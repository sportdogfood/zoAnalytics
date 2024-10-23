// fetchReport.js
const AnalyticsClient = require('./ZohoAnalyticsNodejsClient/AnalyticsClient');

// Initialize the ZohoAnalytics client with credentials from environment variables
const zohoAnalytics = new AnalyticsClient(
  process.env.ZOHO_CLIENT_ID,
  process.env.ZOHO_CLIENT_SECRET,
  process.env.ZOHO_REFRESH_TOKEN
);

// Function to fetch a report
async function getReport(workspaceId, viewId) {
  try {
    // Refresh access token first
    await zohoAnalytics.refreshAccessToken();
    const report = await zohoAnalytics.getReport(workspaceId, viewId);
    console.log('Report Data:', report);
  } catch (error) {
    console.error('Error fetching report:', error);
  }
}

// Replace these with your actual workspace and view IDs
const workspaceId = '1386797000003126041';
const viewId = '1386797000023629500';



getReport(workspaceId, viewId);

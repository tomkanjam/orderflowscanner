import { debugTraderFilters } from '../src/utils/debugTraderFilters';
import { traderManager } from '../src/services/traderManager';

async function findAndReportIssues() {
  console.log('🔍 Scanning trader filters for issues...\n');
  
  // Wait a bit for trader manager to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const issues = await debugTraderFilters();
  
  if (issues.length === 0) {
    console.log('✅ No issues found in trader filters!');
    return;
  }
  
  console.log(`⚠️  Found ${issues.length} issue(s):\n`);
  
  // Group issues by trader
  const issuesByTrader = new Map<string, typeof issues>();
  
  for (const issue of issues) {
    const traderId = issue.traderId;
    if (!issuesByTrader.has(traderId)) {
      issuesByTrader.set(traderId, []);
    }
    issuesByTrader.get(traderId)!.push(issue);
  }
  
  // Report issues
  for (const [traderId, traderIssues] of issuesByTrader) {
    const traderName = traderIssues[0].traderName;
    console.log(`\n📊 Trader: ${traderName} (${traderId})`);
    console.log('─'.repeat(50));
    
    for (const issue of traderIssues) {
      console.log(`\n❌ Issue: ${issue.issue}`);
      console.log(`💡 Suggestion: ${issue.suggestion}`);
    }
  }
  
  // Find the specific Downside Break Scalp trader
  console.log('\n\n🔍 Looking for Downside Break Scalp trader specifically...\n');
  
  const traders = await traderManager.getTraders();
  const downsideTrader = traders.find(t => 
    t.name.toLowerCase().includes('downside') || 
    t.name.toLowerCase().includes('break')
  );
  
  if (downsideTrader) {
    console.log(`Found trader: ${downsideTrader.name}`);
    if (downsideTrader.filter?.code) {
      console.log('\nFilter code preview:');
      console.log('─'.repeat(50));
      console.log(downsideTrader.filter.code.substring(0, 500) + '...');
      
      // Check for specific issues
      if (downsideTrader.filter.code.includes('bands.slice')) {
        console.log('\n⚠️  This trader has the bands.slice issue!');
        console.log('The Bollinger Bands function returns {upper, middle, lower} not an array.');
      }
    }
  } else {
    console.log('Could not find Downside Break Scalp trader');
  }
}

// Run the script
findAndReportIssues().catch(console.error);
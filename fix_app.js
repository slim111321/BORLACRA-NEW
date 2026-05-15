const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// 1. Fix paystackKey -> publicKey
code = code.replace(/paystackKey=\{/g, 'publicKey={');

// 2. Fix Button without onPress (line 1926)
code = code.replace(/<Button style=\{\{ marginTop: 20, backgroundColor: '#7C3AED' \}\}>/g, '<Button style={{ marginTop: 20, backgroundColor: \'#7C3AED\' }} onPress={() => {}}>');

// 3. Move lines 188 to 316 down to before `const renderScreen`
const lines = code.split('\n');

// Find the start line for handlePaymentSuccess (which is line 187/188)
const startIdx = lines.findIndex(l => l.includes('const handlePaymentSuccess = useCallback((res: any) => {'));
const endIdx = lines.findIndex(l => l.includes('}, [step, fetchHistory, fetchFinanceData, fetchLogisticsData, fetchPerformanceData, fetchBroadcastData, fetchUserData]);'));

if (startIdx !== -1 && endIdx !== -1) {
  const extracted = lines.splice(startIdx, endIdx - startIdx + 1);
  const renderScreenIdx = lines.findIndex(l => l.includes('const renderScreen = () => {'));
  lines.splice(renderScreenIdx, 0, ...extracted, '');
  fs.writeFileSync('App.tsx', lines.join('\n'), 'utf8');
  console.log("Fixes applied successfully.");
} else {
  console.log("Could not find start or end index.");
}


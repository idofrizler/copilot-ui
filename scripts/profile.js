const CDP = require('chrome-remote-interface');
const fs = require('fs');
const readline = require('readline');

(async () => {
  const targets = await CDP.List({ port: 9222 });
  const renderer = targets.find((t) => t.title === 'Cooper' && t.type === 'page');
  if (!renderer) {
    console.error('Could not find Cooper renderer target');
    process.exit(1);
  }

  const client = await CDP({ port: 9222, target: renderer });
  const { Profiler, Performance } = client;

  await Profiler.enable();
  await Performance.enable();
  await Profiler.setSamplingInterval({ interval: 100 }); // 100μs for high resolution

  console.log('\n🔴 CPU Profiler STARTED — go reproduce the slow behavior in Cooper now.');
  console.log('   Press ENTER here when done to stop profiling and save the trace.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.on('line', async () => {
    console.log('⏳ Stopping profiler...');
    const { profile } = await Profiler.stop();

    const outFile = `cooper-profile-${Date.now()}.cpuprofile`;
    fs.writeFileSync(outFile, JSON.stringify(profile));
    console.log(`\n✅ Profile saved to: ${outFile}`);
    console.log('   Open it in Chrome DevTools → Performance tab → Load profile');
    console.log('   Or: chrome://inspect → Open dedicated DevTools → Performance → Load\n');

    await client.close();
    process.exit(0);
  });

  await Profiler.start();
})();

async function test() {
  console.log('Testing IPv4...');
  const res1 = await fetch('http://127.0.0.1:11434/api/tags');
  console.log('IPv4 ok', res1.status);

  console.log('Testing localhost...');
  const res2 = await fetch('http://localhost:11434/api/tags');
  console.log('localhost ok', res2.status);
}
test();

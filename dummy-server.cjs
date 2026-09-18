const http = require('http');
const server = http.createServer((req, res) => {
  console.log('Received request, holding connection indefinitely...');
});
server.listen(8081, () => console.log("Hanging server running on 8081"));

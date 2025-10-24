# Minimal test image - no build step
FROM node:20-alpine

WORKDIR /app

# Create a simple health check server
RUN printf 'const http = require("http");\nconst server = http.createServer((req, res) => {\n  if (req.url === "/health") {\n    res.writeHead(200);\n    res.end("OK");\n  } else {\n    res.writeHead(200);\n    res.end("TradeMind Cloud Backend (Stub)");\n  }\n});\nserver.listen(8080, () => console.log("Server running on port 8080"));' > server.js

EXPOSE 8080
HEALTHCHECK --interval=30s CMD node -e "require('http').get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

CMD ["node", "server.js"]

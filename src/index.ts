import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Serve HTML page
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../views/index.html"));
});

// Replace with your own API key
const ALPHA_VANTAGE_API_KEY = "QTRZV54XNSVEA8WQ";

// Top-level (global)
const stockCache = new Map<
  string,
  { timestamp: number; data: { time: string; price: number }[] }
>();

const activeSymbols: string[] = []; // Max 4 symbols at a time



// In fetchStockPriceSeries
async function fetchStockPriceSeries(symbol: string): Promise<Array<{ time: string, price: number }>> {
  const now = Date.now();
  const cacheTTL = 1000 * 60 * 5; // 5 minutes

  const cached = stockCache.get(symbol);
  if (cached && now - cached.timestamp < cacheTTL) {
    console.log(`[CACHE] Using cached data for ${symbol}`);
    return cached.data;
  }

  console.log(`[FETCH] Requesting data for ${symbol}`);
  try {
    const response = await axios.get(
      'https://www.alphavantage.co/query',
      {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol,
          outputsize: 'compact',
          apikey: ALPHA_VANTAGE_API_KEY,
        },
      }
    );

    const rawData = response.data['Time Series (Daily)'];
    if (!rawData) throw new Error('Invalid API data');

    const parsed = Object.entries(rawData)
      .map(([date, d]) => ({
        time: date,
        price: parseFloat((d as any)['4. close']),
      }))
      .reverse();

    stockCache.set(symbol, {
      timestamp: now,
      data: parsed,
    });

    return parsed;
  } catch (err: any) {
    console.error(`[ERROR] Could not fetch ${symbol}:`, err.message);
    return [];
  }
}



// Socket.IO connection
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  for (const symbol of activeSymbols) {
    const cached = stockCache.get(symbol);
    if (cached) {
      socket.emit('broadcast-price-series', {
        symbol,
        series: cached.data,
      });
    }
  }
  socket.on('get-stock-price', async (symbol: string) => {
  symbol = symbol.toUpperCase();

  // Already active? Do nothing
  if (activeSymbols.includes(symbol)) return;

  // Max 4 datasets total
  if (activeSymbols.length >= 4) {
    socket.emit('broadcast-price-series', {
      error: 'Max of 4 datasets reached.',
      symbol,
    });
    return;
  }

  const series = await fetchStockPriceSeries(symbol);
  if (!series.length) {
    socket.emit('broadcast-price-series', {
      error: 'Could not fetch data',
      symbol,
    });
    return;
  }

  // Cache already handled inside fetchStockPriceSeries()
  activeSymbols.push(symbol);

  // Notify all clients
  io.emit('broadcast-price-series', {
    symbol,
    series,
  });
});

socket.on('remove-symbol', (symbol: string) => {
  symbol = symbol.toUpperCase();
  const index = activeSymbols.indexOf(symbol);
  if (index !== -1) {
    activeSymbols.splice(index, 1);
    console.log(`[REMOVE] ${symbol} removed from activeSymbols`);

    // Notify all clients to remove the dataset
    io.emit('symbol-removed', symbol);
  }
});


  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

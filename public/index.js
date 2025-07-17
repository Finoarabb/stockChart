// public/client.js
const socket = io();

const ctx = document.getElementById("chart").getContext("2d");
const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [],
  },
  options: {
    scales: {
      y: {
        title: {
          display: true,
          text: "Price (USD)",
        },
        ticks: {
          callback: function (value) {
            return "$" + value;
          },
        },
      },
    },
    plugins: {
      legend: {
        onClick: (e, legendItem, legend) => {
          const index = legendItem.datasetIndex;
          const ci = legend.chart;
          ci.data.datasets.splice(index, 1);

          // Optionally: clear labels if no datasets left
          if (ci.data.datasets.length === 0) {
            ci.data.labels = [];
          }

          ci.update();

          // Emit to server to also remove it from activeSymbols
          const removedSymbol = legendItem.text;
          socket.emit("remove-symbol", removedSymbol);
        },
      },
    },
  },
});

document.getElementById("symbolForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const symbol = document.getElementById("symbolInput").value.toUpperCase();
  if (!symbol) return;

  // Prevent duplicate symbols
  const existing = chart.data.datasets.find((ds) => ds.label === symbol);
  if (existing) return alert(`Already showing ${symbol}`);

  if (chart.data.datasets.length >= 4) {
    alert("Maximum of 4 stocks allowed.");
    return;
  }

  socket.emit("get-stock-price", symbol);
});

socket.on("broadcast-price-series", ({ symbol, series, error }) => {
  if (error) {
    alert(error);
    return;
  }

  // Keep shared time labels (assuming they are aligned enough for simplicity)
  if (chart.data.labels.length === 0) {
    chart.data.labels = series.map((p) => p.time);
  }

  chart.data.datasets.push({
    label: symbol,
    data: series.map((p) => p.price),
    borderColor: getRandomColor(),
    borderWidth: 2,
    fill: false,
  });

  chart.update();
});

socket.on('symbol-removed', (symbol) => {
  const index = chart.data.datasets.findIndex(ds => ds.label === symbol);
  if (index !== -1) {
    chart.data.datasets.splice(index, 1);

    if (chart.data.datasets.length === 0) {
      chart.data.labels = [];
    }

    chart.update();
  }
});


// Utility to assign colors
function getRandomColor() {
  const colors = ["blue", "green", "orange", "red", "purple", "brown"];
  return colors[Math.floor(Math.random() * colors.length)];
}

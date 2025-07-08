var ctx = document.getElementById("rfvChart").getContext("2d");
new Chart(ctx, {
  type: "bar",
  data: {
    labels: [
      "Alta Recência",
      "Alta Frequência",
      "Alto Valor",
      "RFV Alto",
      "RFV Médio",
      "RFV Baixo",
    ],
    datasets: [
      {
        label: "Clientes",
        data: [45, 60, 35, 25, 40, 15],
        backgroundColor: [
          "#007bff",
          "#28a745",
          "#ffc107",
          "#17a2b8",
          "#6c757d",
          "#dc3545",
        ],
        borderRadius: 6,
      },
    ],
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 10 },
      },
    },
  },
});

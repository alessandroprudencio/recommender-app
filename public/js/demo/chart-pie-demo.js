// Pie Chart - Categorias mais recomendadas
(Chart.defaults.global.defaultFontFamily = "Nunito"),
  '-apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
Chart.defaults.global.defaultFontColor = "#858796";

var ctx = document.getElementById("myPieChart");

const dataChartEngagementByCategoryAttribute = JSON.parse(
  ctx.getAttribute("data-engagement-by-rfvCategories")
);

const dataChartEngagementByCategory =
  dataChartEngagementByCategoryAttribute.map((item) => item.count);
const labelsChartEngagementByCategory =
  dataChartEngagementByCategoryAttribute.map((item) => item.category);
const colorsChartEngagementByCategory =
  dataChartEngagementByCategoryAttribute.map((item) => item.color);
const hoverColorsChartEngagementByCategory =
  dataChartEngagementByCategoryAttribute.map((item) => item.hoverColor);

// console.log(dataChartEngagementByCategory);
// console.log(labelsChartEngagementByCategory);

const container = document.getElementById("legend-container");

dataChartEngagementByCategoryAttribute.forEach((legend) => {
  const span = document.createElement("span");
  span.classList.add("mr-2");

  const icon = document.createElement("i");
  icon.classList.add("fas", "fa-circle");
  icon.style.color = legend.color;

  span.appendChild(icon);
  span.append(" " + legend.category);

  container.appendChild(span);
});

var myPieChart = new Chart(ctx, {
  type: "doughnut",
  data: {
    labels: labelsChartEngagementByCategory, // categorias de produtos

    datasets: [
      {
        data: dataChartEngagementByCategory, // quantidade de interações ou recomendações por categoria
        backgroundColor: colorsChartEngagementByCategory,
        hoverBackgroundColor: hoverColorsChartEngagementByCategory,
        hoverBorderColor: "rgba(234, 236, 244, 1)",
      },
    ],
  },
  options: {
    maintainAspectRatio: false,
    tooltips: {
      backgroundColor: "rgb(255,255,255)",
      bodyFontColor: "#858796",
      borderColor: "#dddfeb",
      borderWidth: 1,
      xPadding: 15,
      yPadding: 15,
      displayColors: false,
      caretPadding: 10,
    },
    legend: {
      display: true,
      position: "bottom", // ou 'right', se preferir
    },
    cutoutPercentage: 70, // ajuste visual do "donut"
  },
});

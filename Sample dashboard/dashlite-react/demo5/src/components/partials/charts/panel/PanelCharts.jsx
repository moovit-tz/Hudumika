import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";

import { Chart, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler, Legend, } from "chart.js";
Chart.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler, Legend,);

import {
  refBarChart,
  refBarChart4,
  refBarChartSet2,
  refBarChartSet3,
  mainBalance,
  mainBalanceSet2,
  mainBalanceSet3,
  availableBalance,
  summaryBalance,
  summaryBalanceMonth,
  summaryBalanceCurrent,
  summaryBalanceYear,
} from "./PanelChartData";

export const BalanceFlowChart = ({ state }) => {
  const [data, setData] = useState(mainBalance);
  useEffect(() => {
    let defaultData;
    if (state === "month") {
      defaultData = mainBalanceSet2;
    } else if (state === "year") {
      defaultData = mainBalanceSet3;
    } else {
      defaultData = mainBalance;
    }
    setData(defaultData);
  }, [state]);
  return (
    <Line
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#eff6ff",
              titleFont: {
                size: '13px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 6,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '12px',
              },
              bodySpacing: 4,
              padding: 10,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return context.parsed.y + " BTC";
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              ticks: {
                beginAtZero: false,
                fontSize: 12,
                fontColor: "#9eaecf",
                padding: 10,
              },
              gridLines: {
                color: "rgba(82, 100, 132, 0.2)",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132, 0.2)",
              },
            },
          x:{
              ticks: {
                fontSize: 12,
                fontColor: "#9eaecf",
                source: "auto",
                padding: 5,
              },
              gridLines: {
                color: "transparent",
                tickMarkLength: 20,
                zeroLineColor: "rgba(82, 100, 132, 0.2)",
                offsetGridLines: true,
              },
            },
        },
      }}
    />
  );
};

export const ReferralCharts = ({ state }) => {
  const [data, setData] = useState(refBarChart);
  useEffect(() => {
    let object;
    if (state === "7") {
      object = refBarChartSet2;
    } else if (state === "15") {
      object = refBarChartSet3;
    } else {
      object = refBarChart4;
    }
    setData(object);
  }, [state]);
  return (
    <Bar
      data={data}
      className="chart-refer-stats chartjs-render-monitor"
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#eff6ff",
              titleFont: {
                size: '11px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 4,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '10px',
              },
              bodySpacing: 3,
              padding: 8,
              footerMarginTop: 0,
              callbacks: {
                title: function () {
                  return false; 
                },
                label: function (context) {
                    return `${context.parsed.y} people`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              display: false,
              ticks: {
                beginAtZero: true,
              },
            },
          x:{
              display: false,
            },
        },
      }}
    />
  );
};

export const AvailableBalanceCharts = ({ currency }) => {
  return (
    <Bar
      data={availableBalance}
      options={{
        
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#eff6ff",
              titleFont: {
                size: '13px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 6,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '12px',
              },
              bodySpacing: 4,
              padding: 10,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return `${context.parsed.y} + ${currency}`;
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              display: false,
            },
          x: {
              display: false,
            },
        },
      }}
    />
  );
};

export const BalanceSummaryChart = ({ state }) => {
  const [data, setData] = useState(summaryBalance);
  useEffect(() => {
    let defaultData;
    if (state === "month") {
      defaultData = summaryBalanceMonth;
    } else if (state === "year") {
      defaultData = summaryBalanceYear;
    } else if (state === "current") {
      defaultData = summaryBalanceCurrent;
    } else {
      defaultData = summaryBalance;
    }
    setData(defaultData);
  }, [state]);

  return (
    <Line
      data={data}
      options={{
        plugins: {
          legend: {
              display: false,
          },
          tooltip: {
              enabled: true,
              displayColors: false,
              backgroundColor: "#eff6ff",
              titleFont: {
                size: '13px',
              },
              titleColor: "#6783b8",
              titleMarginBottom: 6,
              bodyColor: "#9eaecf",
              bodyFont: {
                size: '12px',
              },
              bodySpacing: 4,
              padding: 10,
              footerMarginTop: 0,
              callbacks: {
                label: function (context) {
                    return context.parsed.y  + " BTC";
                },
              },
          },
        },
        maintainAspectRatio: false,
        scales: {
          y:{
              ticks: {
                beginAtZero: false,
                fontSize: 12,
                fontColor: "#9eaecf",
                padding: 10,
              },
              gridLines: {
                color: "rgba(82, 100, 132, 0.2)",
                tickMarkLength: 0,
                zeroLineColor: "rgba(82, 100, 132, 0.2)",
              },
            },
          x:{
              ticks: {
                fontSize: 12,
                fontColor: "#9eaecf",
                source: "auto",
                padding: 5,
              },
              gridLines: {
                color: "transparent",
                tickMarkLength: 20,
                zeroLineColor: "rgba(82, 100, 132, 0.2)",
                offsetGridLines: true,
              },
            },
        },
      }}
    />
  );
};

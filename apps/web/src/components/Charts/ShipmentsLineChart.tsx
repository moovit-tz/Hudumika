import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type ShipmentsLineChartProps = {
  data?: number[];
  labels?: string[];
};

export const ShipmentsLineChart: React.FC<ShipmentsLineChartProps> = ({ data = [], labels = [] }) => {
  const chartData = {
    labels: labels.length ? labels : data.map((_, i) => `Day ${i + 1}`),
    datasets: [
      {
        label: 'Shipments',
        data: data.length ? data : [5, 8, 6, 10, 7, 12, 9],
        fill: false,
        backgroundColor: 'var(--color-primary)',
        borderColor: 'var(--color-primary)',
        tension: 0.2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Shipments Over Time' },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };

  return <Line data={chartData} options={options} />;
};

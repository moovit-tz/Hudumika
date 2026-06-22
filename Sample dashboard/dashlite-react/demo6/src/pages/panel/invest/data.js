export const pricingTableDataV1 = [
  {
    id: "plan-iv-1",
    title: "Starter",
    caption: "Enjoy entry level of invest & earn.",
    interest: 1.67,
    term: 30,
    startDate: "Nov 04, 2019",
    endDate: "Dec 04, 2019",
    minDeposit: {
      usd: 250,
      euro: 221,
      BTC: 0.0052,
      ETH: 6,
    },
    maxDeposit: {
      usd: 1999,
      euro: 1700,
      BTC: 0.041,
      ETH: 50,
    },
    investLevels: {
      usd: [250, 500, 1000, 1500, 1999],
      euro: [221, 500, 1000, 1500, 1700],
      BTC: [0.0052, 0.01, 0.041],
      ETH: [6, 20, 30, 50],
    },
    return: "Yes",
    totalReturn: 125,
    tags: false,
  },
  {
    id: "plan-iv-2",
    title: "Silver",
    caption: "Best plan for user to investers.",
    interest: 4.76,
    term: 21,
    startDate: "Nov 04, 2019",
    endDate: "Nov 25, 2019",
    minDeposit: {
      usd: 2000,
      euro: 1771,
      BTC: 0.041,
      ETH: 50,
    },
    maxDeposit: {
      usd: 4999,
      euro: 4427,
      BTC: 0.099,
      ETH: 125,
    },
    investLevels: {
      usd: [2000, 2500, 3000, 4000, 4999],
      euro: [1771, 2000, 2500, 3000, 4427],
      BTC: [0.041, 0.07, 0.099],
      ETH: [50, 70, 90, 110, 125],
    },
    return: "Yes",
    totalReturn: 200,
    tags: false,
  },
  {
    id: "plan-iv-3",
    title: "Diamond",
    caption: "Advance level of invest & earn.",
    interest: 14.29,
    term: 14,
    startDate: "Nov 04, 2019",
    endDate: "Nov 18, 2019",
    minDeposit: {
      usd: 5000,
      euro: 4428,
      BTC: 0.1,
      ETH: 125,
    },
    maxDeposit: {
      usd: 20000,
      euro: 17712,
      BTC: 0.41,
      ETH: 500,
    },
    investLevels: {
      usd: [5000, 10000, 12000, 15000, 20000],
      euro: [4428, 7000, 10000, 15000, 17712],
      BTC: [0.1, 0.3, 0.41],
      ETH: [125, 200, 300, 400, 500],
    },
    return: "Yes",
    totalReturn: 300,
    tags: true,
  },
  {
    id: "plan-iv-4",
    title: "Platinum",
    caption: "Just invest money & earn.",
    interest: 21.07,
    term: 7,
    startDate: "Nov 04, 2019",
    endDate: "Nov 11, 2019",
    minDeposit: {
      usd: 10500,
      euro: 9298,
      BTC: 0.21,
      ETH: 265,
    },
    maxDeposit: {
      usd: 50999,
      euro: 45164,
      BTC: 1.05,
      ETH: 1200,
    },
    investLevels: {
      usd: [10500, 20000, 30000, 40000, 50999],
      euro: [9298, 20000, 30000, 40000, 45000],
      BTC: [0.21, 0.5, 1.05],
      ETH: [265, 500, 800, 1000, 1200],
    },
    return: "Yes",
    totalReturn: 500,
    tags: false,
  },
];

export const activePlans = [
  {
    id: "plan-v-1",
    title: "Silver",
    caption: "Just invest money & earn.",
    interest: 4.76,
    term: 21,
    minDeposit: {
      usd: 250,
      euro: 1771,
      BTC: 0.041,
      ETH: 50,
    },
    startDate: "Nov 04, 2019",
    endDate: "Nov 25, 2019",
    totalReturn: 499.99,
    netProfitMin: 97.75,
    netProfitMax: 152.04,
  },
  {
    id: "plan-v-2",
    title: "Silver",
    caption: "Just invest money & earn.",
    interest: 4.76,
    term: 21,
    minDeposit: {
      usd: 1250,
      euro: 1771,
      BTC: 0.041,
      ETH: 50,
    },
    startDate: "Oct 30, 2019",
    endDate: "Nov 19, 2019",
    totalReturn: 2500.0,
    netProfitMin: 105.25,
    netProfitMax: 145.75,
  },
];

export const userData = [
  {
    id: 1,
    avatarBg: "purple",
    name: "Abu Bin Ishtiyak",
    displayName: "Ishtiak",
    dob: "10 Aug, 1980",
    role: "Customer",
    checked: false,
    email: "info@softnio.com",
    balance: "35,040.34",
    phone: "818474958",
    emailStatus: "success",
    kycStatus: "success",
    lastLogin: "10 Feb 2020",
    status: "Active",
    address: "2337 Kildeer Drive",
    state: "Kentucky",
    country: "Canada",
    designation: "UI/UX Designer",
    projects: "213",
    performed: "87.5",
    tasks: "587",
  },
];

export const transactionData = [
  {
    type: "Investment",
    date: "04 Nov, 2018",
    amount: "- 2500.00",
  },
  {
    type: "Profit - 4.76%",
    date: "05 Nov, 2018",
    amount: "+ 119.10",
  },
  {
    type: "Profit - 4.76%",
    date: "06 Nov, 2018",
    amount: "+ 119.10",
  },
];

export const countryOptions = [
  { value: "Canada", label: "Canada" },
  { value: "USA", label: "USA" },
  { value: "India", label: "India" },
  { value: "Bangladesh", label: "Bangladesh" },
  { value: "France", label: "France" },
  { value: "England", label: "England" },
];

// Charts

export const overviewKnob = {
  labels: ["", "", ""],
  dataUnit: "BTC",
  legend: false,
  datasets: [
    {
      borderColor: "transparent",
      backgroundColor: ["#6576ff", "#d9e5f7"],
      data: [220, 80],
    },
  ],
};

export const netProfitKnob = {
  labels: ["", "", ""],
  dataUnit: "BTC",
  legend: false,
  datasets: [
    {
      borderColor: "transparent",
      backgroundColor: ["#33d895", "#d9e5f7"],
      data: [220, 80],
    },
  ],
};
export const dayRemainKnob = {
  labels: ["", "", ""],
  dataUnit: "BTC",
  legend: false,
  datasets: [
    {
      borderColor: "transparent",
      backgroundColor: ["#816bff", "#d9e5f7"],
      data: [220, 80],
    },
  ],
};

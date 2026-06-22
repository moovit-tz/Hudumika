import PlanS1 from "@/images/icons/plan-s1.svg";
import PlanS2 from "@/images/icons/plan-s2.svg";
import PlanS3 from "@/images/icons/plan-s3.svg";

const pricingTableData = [
    {
        id: 1,
        title: "Starter",
        logo: PlanS1,
        desc: "If you are a small business amn please select this plan",
        amount: 99,
        userNumber: 1,
        tags: false,
      },
      {
        id: 2,
        title: "Pro",
        logo: PlanS2,
        desc: "If you are a small business amn please select this plan",
        amount: 299,
        userNumber: 5,
        tags: true,
      },
      {
        id: 3,
        title: "Enterprise",
        logo: PlanS3,
        desc: "If you are a small business amn please select this plan",
        amount: 599,
        userNumber: 20,
        tags: false,
      },
]

export default pricingTableData;
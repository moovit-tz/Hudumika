import React from 'react';
import { Card } from 'reactstrap';
import { UncontrolledDropdown, DropdownMenu, DropdownItem, DropdownToggle } from 'reactstrap';
import { CleanLine,CleanBar } from "@/components/partials/charts/campaign/CampaignCharts";
import { Icon } from "@/components/Component";

const CampaignInfoCard = ({chart,chartData,title,amount, change, direction, theme}) => {
  return (
    <Card className={`h100 bg-${theme}`}>
        <div className="nk-cmwg nk-cmwg1">
            <div className="card-inner pt-3">
                <div className="d-flex justify-content-between">
                    <div className="flex-item">
                        <div className="text-white d-flex flex-wrap">
                            <span className="fs-2 me-1">{amount}</span>
                            <span className="align-self-end fs-14px pb-1"><Icon name={direction === "up" ? "arrow-long-up" : "arrow-long-down"}></Icon>{change}</span>
                        </div>
                        <h6 className="text-white">{title}</h6>
                    </div>
                    <div className="card-tools me-n1">
                        <UncontrolledDropdown>
                            <DropdownToggle className="btn btn-icon btn-sm on-dark" color="trigger" ><em className="icon ni ni-more-v"></em></DropdownToggle>
                            <DropdownMenu end className="dropdown-menu-sm">
                                <ul className="link-list-opt no-bdr">
                                    <li><DropdownItem tag="a" href="#" className="active"><span>15 Days</span></DropdownItem></li>
                                    <li><DropdownItem tag="a" href="#"><span>30 Days</span></DropdownItem></li>
                                    <li><DropdownItem tag="a" href="#"><span>3 Months</span></DropdownItem></li>
                                </ul>
                            </DropdownMenu>
                        </UncontrolledDropdown>
                    </div>
                </div>
            </div>
            <div className="nk-ck-wrap mt-auto overflow-hidden rounded-bottom">
                <div className="nk-cmwg1-ck">
                    {chart === "bar" && <CleanBar data={chartData} className="campaign-bar-chart-s1" />}
                    {chart === "line" && <CleanLine data={chartData} className="campaign-line-chart-s1" />}
                    
                    
                </div>
            </div>
        </div>
    </Card>
  )
}

export default CampaignInfoCard
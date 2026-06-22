import React from 'react';
import { Card, UncontrolledDropdown, DropdownMenu, DropdownToggle } from 'reactstrap';
import { Icon } from '@/components/Component';
import { MediumLine } from '@/components/partials/charts/campaign/CampaignCharts';
import { webConvRate } from '@/components/partials/charts/campaign/CampaignData';

const WebConvrate = ({data,title}) => {
  return (
    <Card className="card-full">
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Web conv. rate</h6>
                </div>
                <div className="card-tools me-n1 mt-n1">
                    <UncontrolledDropdown>
                        <DropdownToggle  className="btn-icon" color="trigger"><Icon name="more-h"></Icon></DropdownToggle>
                        <DropdownMenu end className="dropdown-menu-sm">
                            <ul className="link-list-opt no-bdr">
                                <li><a href="#" className="active"><span>15 Days</span></a></li>
                                <li><a href="#"><span>30 Days</span></a></li>
                                <li><a href="#"><span>3 Months</span></a></li>
                            </ul>
                        </DropdownMenu>
                    </UncontrolledDropdown>
                </div>
            </div>
        </div>
        <div className="card-inner pt-0">
            <div>
                <span className="fs-2 lh-1 mb-1 text-head">3.86%</span>
                <div className="fs-14px">This month</div>
            </div>
            <div className="nk-cmwg4-ck mt-4">
                <MediumLine className="campaign-line-chart-s3" data={webConvRate}></MediumLine>
            </div>
            <div className="chart-label-group ms-5 mt-0">
                <div className="chart-label">Jan</div>
                <div className="chart-label d-none d-sm-block">Feb</div>
                <div className="chart-label d-none d-sm-block">Mar</div>
                <div className="chart-label d-none d-sm-block">Apr</div>
                <div className="chart-label d-none d-sm-block">May</div>
                <div className="chart-label">Jun</div>
            </div>
        </div>
    </Card>
  )
}

export default WebConvrate
import React from 'react';
import { Card, Button } from 'reactstrap';
import { Icon } from '@/components/Component';
import { MediumLine } from '@/components/partials/charts/campaign/CampaignCharts';
import { instagramCampaign } from '@/components/partials/charts/campaign/CampaignData';

const CampaignOverview = () => {
  return (
    <Card className="card-full">
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Instagram  Campaign</h6>
                </div>
                <div className="card-tools">
                    <ul className="d-flex gx-2">
                        <li><Button color="outline-light" size="sm" className="btn-icon rounded-pill"><Icon name="chevron-left"></Icon></Button></li>
                        <li><Button color="outline-primary" size="sm" className="btn-icon rounded-pill"><Icon name="chevron-right"></Icon></Button></li>
                    </ul>
                </div>
            </div>
        </div>
        <div className="card-inner pt-0">
            <div className="rounded px-2 py-4 bg-primary">
                <div className="d-flex">
                    <div className="w-50 px-4">
                        <span className="fs-2 lh-1 mb-1 text-white">24.6K</span>
                        <div className="fs-14px text-white text-opacity-75">New Followers</div>
                    </div>
                    <div className="border-start opacity-50"></div>
                    <div className="w-50 px-4">
                        <span className="fs-2 lh-1 mb-1 text-white">120.0K</span>
                        <div className="fs-14px text-white text-opacity-75">Followers Goal</div>
                    </div>
                </div>
            </div>
            <div className="nk-cmwg3-ck mt-3">
                <MediumLine className="campaign-line-chart-s3" data={instagramCampaign}></MediumLine>
            </div>
            <div className="chart-label-group ms-5 mt-0">
                <div className="chart-label">03 Jan</div>
                <div className="chart-label d-none d-sm-block">10 Jan</div>
                <div className="chart-label d-none d-sm-block">17 Jan</div>
                <div className="chart-label d-none d-sm-block">24 Jan</div>
                <div className="chart-label">31 Jan</div>
            </div>
        </div>
    </Card>
  )
}

export default CampaignOverview
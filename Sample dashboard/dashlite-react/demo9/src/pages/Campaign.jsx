import React, { useState } from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import {
  Block,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockBetween,
  BlockTitle,
  Icon,
  Button,
  Row,
  Col,
} from "@/components/Component";
import CampaignInfoCard from "@/components/partials/campaign/campaign-info-card/CampaignInfoCard";
import CampaignPerformance from "@/components/partials/campaign/campaign-performance/CampaignPerformance";
import {runningCampaign, totalAudience, avgRating, newSubscriber,performanceOverview} from "@/components/partials/charts/campaign/CampaignData"
import TopChannels from "@/components/partials/campaign/top-channels/TopChannels";
import ActiveCampaign from "@/components/partials/campaign/active-campaign/ActiveCampaign";
import KeyStatistics from "@/components/partials/campaign/key-statistics/KeyStatistics";
import CampaignOverview from "@/components/partials/campaign/campaign-overview/CampaignOverview";
import ClicksbyLocation from "@/components/partials/campaign/clicks-by-location/ClicksbyLocation";
import WebConvrate from "@/components/partials/campaign/web-convrate/WebConvrate"

const CampaignHomePage = () => {
  const [sm, updateSm] = useState(false);
  return (
    <React.Fragment>
      <Head title="Campaign Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Campaign Management</BlockTitle>
              <BlockDes className="text-soft">
                <p>Welcome to Campaign Management Dashboard.</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="toggle-wrap nk-block-tools-toggle">
                <Button
                  className={`btn-icon btn-trigger toggle-expand me-n1 ${sm ? "active" : ""}`}
                  onClick={() => updateSm(!sm)}
                >
                  <Icon name="more-v" />
                </Button>
                <div className="toggle-expand-content" style={{ display: sm ? "block" : "none" }}>
                  <ul className="nk-block-tools g-3">
                    <li>
                      <Button className="btn-dim btn-white btn-outline-light">
                        <Icon name="plus"></Icon>
                        <span><span className="d-md-none">Add</span><span className="d-none d-md-block">Add Campaign</span></span>
                      </Button>
                    </li>
                    <li className="nk-block-tools-opt">
                      <Button className="btn-primary">
                        <Icon name="reports"></Icon>
                        <span>Reports</span>
                      </Button>
                    </li>
                  </ul>
                </div>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            <Col lg="3" sm="6">
              <CampaignInfoCard 
                theme="primary"
                title="Running Campaign"
                amount="56.8K"
                change="12.4%"
                direction="up"
                chart="line"
                chartData={runningCampaign}
              />
            </Col>
            <Col lg="3" sm="6">
              <CampaignInfoCard 
                theme="info"
                title="Total Audience"
                amount="857.6K"
                change="12.4%"
                direction="up"
                chart="line"
                chartData={totalAudience}
              />
            </Col>
            <Col lg="3" sm="6">
              <CampaignInfoCard 
                theme="warning"
                title="Avg. Rating"
                amount="9.3K"
                change="12.4%"
                direction="up"
                chart="bar"
                chartData={avgRating}
              />
            </Col>
            <Col lg="3" sm="6">
              <CampaignInfoCard 
                theme="danger"
                title="Subscriber"
                amount="175.2K"
                change="12.4%"
                direction="up"
                chart="line"
                chartData={newSubscriber}
              />
            </Col>
            <Col xxl="8" lg="7">
              <CampaignPerformance 
                title="Performance Overview"
                chartData={performanceOverview} 
              />
            </Col>
            <Col xxl="4" lg="5">
              <TopChannels />
            </Col>
            <Col xxl="8">
              <ActiveCampaign />
            </Col>
            <Col xxl="4" md="6">
              <KeyStatistics />
            </Col>
            <Col xxl="4" md="6">
              <CampaignOverview />
            </Col>
            <Col xxl="4" md="6">
              <ClicksbyLocation />
            </Col>
            <Col xxl="4" md="6">
              <WebConvrate />
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default CampaignHomePage;

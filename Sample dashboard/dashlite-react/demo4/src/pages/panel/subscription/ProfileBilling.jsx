import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Icon, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import {Card} from "reactstrap";

const ProfileBilling = () => {
  return (
    <React.Fragment>
      <Head title="Profile Billing"></Head>
      <Block>
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle tag="h5">Current Subscription</BlockTitle>
            <BlockDes>
              <p>Details about your current subscription and billing information.</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Card className="card-bordered">
          <div className="card-inner-group">
              <div className="card-inner">
                  <div className="between-center flex-wrap flex-md-nowrap g-3">
                      <div className="nk-block-text">
                          <h6>Enterprise Plan - <span className="text-base">$599.00 / Yearly</span></h6>
                          <p className="text-soft">Unlimited access with priority support, 99.95% uptime, powerful features and more...</p>
                      </div>
                      <div className="nk-block-actions flex-shrink-0">
                          <Link to={`/subscription/pricing`} className="btn btn-primary">Change Plan</Link>
                      </div>
                  </div>
              </div>
              <div className="card-inner">
                  <div className="between-center flex-wrap flex-md-nowrap g-3">
                      <div className="nk-block-text">
                          <p>Learn more about our <Link to={`/subscription/pricing`}>subscription options</Link>.</p>
                      </div>
                      <div className="nk-block-actions">
                          <ul className="align-center gx-3">
                              <li>
                                  <div className="custom-control custom-control-right custom-switch">
                                      <input type="checkbox" className="custom-control-input" id="auto-renewal" />
                                      <label className="custom-control-label" htmlFor="auto-renewal">Auto Renewal</label>
                                  </div>
                              </li>
                          </ul>
                      </div>
                  </div>
              </div>
          </div>
        </Card>
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle tag="h5">Billing Cycle</BlockTitle>
            <BlockDes>
              <p>Your subscription renews on Jan 28, 2020 <span className="fs-13px text-soft">(2 months 17 days remaining).</span></p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Card className="card-bordered">
          <div className="card-inner-group">
              <div className="card-inner">
                  <div className="between-center flex-wrap flex-md-nowrap g-3">
                      <div className="nk-block-text">
                          <h6>Yearly Subscription</h6>
                          <ul className="list-inline list-col2 text-soft">
                              <li>Next payment: <strong className="text-base">$599.00 USD</strong> on <strong className="text-base">Jan 28, 2020</strong></li>
                              <li>Last payment made: Jan 28, 2019</li>
                          </ul>
                      </div>
                      <div className="nk-block-actions">
                          <ul className="align-center gx-3">
                              <li className="order-md-last">
                                  <a href="#" className="link link-primary">Switch Billing Cycle</a>
                              </li>
                          </ul>
                      </div>
                  </div>
              </div>
          </div>
        </Card>
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle tag="h5">Manage Licensees</BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <Card className="card-bordered">
          <div className="card-inner-group">
            <div className="card-inner">
                <div className="between-center flex-wrap flex-md-nowrap g-3">
                    <div className="nk-block-text">
                        <h6>20 Licenses</h6>
                        <p className="text-soft">Licensed members have full access to all NioAccount Features.</p>
                    </div>
                    <div className="nk-block-actions">
                        <ul className="align-center gx-3">
                            <li className="order-md-last">
                                <a href="#" className="link link-primary">Manage License</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
          </div>
        </Card>
      </Block>
    </React.Fragment>
  );
};

export default ProfileBilling;

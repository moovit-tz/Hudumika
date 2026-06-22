import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card } from "reactstrap";

const PricingPlans = () => {
  return (
    <React.Fragment>
      <Head title="Pricing Plans"></Head>
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-head-sub"><span></span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="nk-block-title page-title">Pricing Plans</BlockTitle>
              <BlockDes className="text-soft">
                <p>Generate unlimited copy 10X faster with our cost effective plan to write blog posts, social media ads and many more.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
              <Col sm="6" lg="4">
                  <Card className="pricing">
                      <div className="p-4">
                          <div className="pricing-title">
                              <h4 className="card-title title">Basic</h4>
                              <p className="sub-text">Limited Words.</p>
                          </div>
                          <div className="pricing-price">
                              <h3 className="display-5">Free <span className="caption-text text-base fw-normal"> / forever</span></h3>
                          </div>
                      </div>
                      <div className="px-4">
                          <button className="btn btn-outline-light btn-block">Get Started</button>
                      </div>
                      <div className="p-4">
                          <ul className="pricing-features">
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>1000 words/mo. generation</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Total 5000 words generation</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Access to 10 templates</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Upto 5 projects can be created</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Only 7 days of generation history</span></li>
                          </ul>
                      </div>
                  </Card>
              </Col>
              <Col sm="6" lg="4">
                  <Card className="pricing">
                      <div className="p-4">
                          <div className="pricing-title">
                              <h4 className="card-title title">Professional</h4>
                              <p className="sub-text">Unlimited Words.</p>
                          </div>
                          <div className="pricing-price">
                              <h3 className="display-5">$48 <span className="caption-text text-base fw-normal"> / month</span></h3>
                          </div>
                      </div>
                      <div className="px-4">
                          <button className="btn btn-primary btn-block">Upgrade Now</button>
                      </div>
                      <div className="p-4">
                          <ul className="pricing-features">
                              <li><em className="icon text-primary ni ni-check-circle-fill"></em><span>Unlimited words generation</span></li>
                              <li><em className="icon text-primary ni ni-check-circle-fill"></em><span>Access to all templates for free</span></li>
                              <li><em className="icon text-primary ni ni-check-circle-fill"></em><span>No project limitation</span></li>
                              <li><em className="icon text-primary ni ni-check-circle-fill"></em><span>30 days of AI generation history</span></li>
                              <li><em className="icon text-primary ni ni-check-circle-fill"></em><span>Wordpress plugin integration</span></li>
                          </ul>
                      </div>
                  </Card>
              </Col>
              <Col sm="6" lg="4">
                  <Card className="pricing">
                      <div className="p-4">
                          <div className="pricing-title">
                              <h4 className="card-title title">Enterprise</h4>
                              <p className="sub-text">Customized Plan.</p>
                          </div>
                          <div className="pricing-price">
                              <h3 className="display-5">$225 <span className="caption-text text-base fw-normal"> / month</span></h3>
                          </div>
                      </div>
                      <div className="px-4">
                          <button className="btn btn-outline-light btn-block">Upgrade Now</button>
                      </div>
                      <div className="p-4">
                          <ul className="pricing-features">
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Dedicated Account Manager</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Custom Tools</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Advanced Integrations</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Premium Technical Support</span></li>
                              <li><em className="icon text-primary ni ni-check-circle"></em><span>Many More Special Features</span></li>
                          </ul>
                      </div>
                  </Card>
              </Col>
          </Row>
          <div className="mt-5">
              <h5>Want to learn more about our pricing &amp; plans?</h5>
              <p>Read our <a href="#">Plans</a>, <a href="#">Billing &amp; Payment</a>, <a href="#">FAQs</a> to learn more about our service.</p>
          </div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default PricingPlans;

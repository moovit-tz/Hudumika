import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Button, Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon } from "@/components/Component";
import { Link } from "react-router-dom";
import { Badge, Card } from "reactstrap";
import pricingTableData from "./data/pricingTable";
import { svgData } from "@/pages/components/crafted-icons/NioIconData";
const helpSupportIcon = svgData.filter((icon) => icon.slug === "help-support")[0]
const Pricing = () => {
  return (
    <React.Fragment>
      <Head title="Pricing"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span>Pricing</span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Choose Suitable Plan</BlockTitle>
              <BlockDes>
                <p>You can change your plan any time by upgrade your plan</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            {pricingTableData.map((item) => {
              return (
                <Col md="4" key={item.id}>
                  <Card className={`card-bordered pricing text-center ${item.tags ? "recommend" : ""}`}>
                    {item.tags && (
                      <Badge color="primary" className="pricing-badge">
                        Recommend
                      </Badge>
                    )}
                    <div className="pricing-body">
                      <div className="pricing-media">
                        <img src={item.logo} alt="" />
                      </div>
                      <div className="pricing-title w-220px mx-auto">
                        <h5 className="title">{item.title}</h5>
                        <span className="sub-text">{item.desc}</span>
                      </div>
                      <div className="pricing-amount">
                        <div className="amount">
                          ${item.amount} <span>/yr</span>
                        </div>
                        <span className="bill">{item.userNumber} User, Billed Yearly</span>
                      </div>
                      <div className="pricing-action">
                        <Button color="primary">Select Plan</Button>
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Block>
        <Block>
          <Card className="card-bordered">
            <table className="table table-features">
              <thead className="tb-ftr-head table-light">
                  <tr className="tb-ftr-item">
                      <th className="tb-ftr-info">Features</th>
                      <th className="tb-ftr-plan">Starter</th>
                      <th className="tb-ftr-plan">Pro</th>
                      <th className="tb-ftr-plan">Enterprise</th>
                  </tr>
              </thead>
              <tbody className="tb-ftr-body">
                  <tr className="tb-ftr-item">
                      <td className="tb-ftr-info">Alias record</td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Starter</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Pro</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Enterprise</span></td>
                  </tr>
                  <tr className="tb-ftr-item">
                      <td className="tb-ftr-info">Anycast DNS</td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Starter</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Pro</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Enterprise</span></td>
                  </tr>
                  <tr className="tb-ftr-item">
                      <td className="tb-ftr-info">Full API access</td>
                      <td className="tb-ftr-plan"><Icon name="cross"/> <span className="plan-name">Starter</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Pro</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Enterprise</span></td>
                  </tr>
                  <tr className="tb-ftr-item">
                      <td className="tb-ftr-info">Multiple-layered DoS defense</td>
                      <td className="tb-ftr-plan"><Icon name="cross"/> <span className="plan-name">Starter</span></td>
                      <td className="tb-ftr-plan"><Icon name="cross"/> <span className="plan-name">Pro</span></td>
                      <td className="tb-ftr-plan"><Icon name="check-thick"/> <span className="plan-name">Enterprise</span></td>
                  </tr>
              </tbody>
            </table>
          </Card>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="nk-help">
                  <div className="nk-help-img">
                      {helpSupportIcon.svg}
                  </div>
                  <div className="nk-help-text">
                      <h5>We’re here to help you!</h5>
                      <p className="text-soft">Ask a question or file a support ticket or report an issues. Our team support team will get back to you by email.</p>
                  </div>
                  <div className="nk-help-action">
                      <Link to={`/subscription/contact`} className="btn btn-lg btn-outline-primary">Get Support Now</Link>
                  </div>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Pricing;

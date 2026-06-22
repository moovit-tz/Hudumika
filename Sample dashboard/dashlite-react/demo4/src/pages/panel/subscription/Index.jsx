import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Col, Icon, Row } from "@/components/Component";
import { Badge, Card } from "reactstrap";
import { Link } from "react-router-dom";
import { svgData } from "@/pages/components/crafted-icons/NioIconData";
import paymentData from "./data/payments";
import introCard from "./data/home";
import subscriptionData from "./data/subscription";

const payments = paymentData.slice(0,3);
const helpSupportIcon = svgData.filter((icon) => icon.slug === "help-support")[0];
const subscription = subscriptionData.filter((item) => item.status === "Active")[0];

const Dashboard = () => {
  return (
    <React.Fragment>
      <Head title="Dashboard"></Head>
      <Content>
        <BlockHead size="lg">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Dashboard</BlockTitle>
              <BlockDes>
                <p>Welcome to our dashboard. Manage your account and your subscriptions.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            {introCard.map((item,index) => {
                const icon = svgData.filter((icon) => icon.slug === item.icon)[0];
                return(
                  <Col md="6" key={index}>
                    <Card className="card-bordered card-full">
                      <div className="nk-wg1">
                          <div className="nk-wg1-block">
                              <div className="nk-wg1-img">
                                  {icon.svg}
                              </div>
                              <div className="nk-wg1-text">
                                  <h5 className="title">{item.title}</h5> 
                                  <p>{item.description}</p>
                              </div>
                          </div>
                          <div className="nk-wg1-action">
                              <Link to={`${item.linkTo}`} className="link"><span>{item.linkText}</span> <Icon name="chevron-right"></Icon></Link>
                          </div>
                      </div>
                    </Card>
                  </Col>
                )
              }
            )}
          </Row>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner-group">
                <div className="card-inner">
                    <div className="between-center flex-wrap flex-md-nowrap g-3">
                        <div className="nk-block-text">
                            <h6>{subscription.title} - <span className="text-base">{subscription.price} / Yearly</span></h6>
                            <p className="text-soft">{subscription.access} access with priority support, 99.95% uptime, powerfull features and more...</p>
                        </div>
                        <div className="nk-block-actions flex-shrink-0">
                            <Link to={`/subscription/subscription-details/${subscription.id}`} className="btn btn-primary">View Plan</Link>
                        </div>
                    </div>
                </div>
                <div className="card-inner">
                    <div className="between-center flex-wrap flex-md-nowrap g-3">
                        <div className="nk-block-text">
                            <p>Learn more about our <Link to={`/subscription/subscriptions`}>subscription options</Link>.</p>
                        </div>
                    </div>
                </div>
            </div>
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
        <Block>
          <Card className="card-bordered">
            <div className="card-inner card-inner-md">
                <div className="card-title-group">
                    <h6 className="card-title">Payment History</h6>
                    <div className="card-action">
                        <Link to={`/subscription/payments`} className="link link-sm">See All <em className="icon ni ni-chevron-right"></em></Link>
                    </div>
                </div>
            </div>

            <table className="table table-tranx">
                <thead>
                    <tr className="tb-tnx-head">
                        <th className="tb-tnx-id"><span className="">#</span></th>
                        <th className="tb-tnx-info">
                            <span className="tb-tnx-desc d-none d-sm-inline-block">
                                <span>Bill For</span>
                            </span>
                            <span className="tb-tnx-date d-md-inline-block d-none">
                                <span className="d-md-none">Date</span>
                                <span className="d-none d-md-block">
                                    <span>Issue Date</span>
                                    <span>Due Date</span>
                                </span>
                            </span>
                        </th>
                        <th className="tb-tnx-amount">
                            <span className="tb-tnx-total">Total</span>
                            <span className="tb-tnx-status d-none d-md-inline-block">Status</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {payments.length > 0
                      ? payments.map((item) => {
                          return (
                            <tr key={item.id} className="tb-tnx-item">
                              <td className="tb-tnx-id">
                                <a
                                  href="#ref"
                                  onClick={(ev) => {
                                    ev.preventDefault();
                                  }}
                                >
                                  <span>{item.ref}</span>
                                </a>
                              </td>
                              <td className="tb-tnx-info">
                                <div className="tb-tnx-desc">
                                  <span className="title">{item.bill}</span>
                                </div>
                                <div className="tb-tnx-date">
                                  <span className="date">{item.issue}</span>
                                  <span className="date">{item.due}</span>
                                </div>
                              </td>
                              <td className="tb-tnx-amount is-alt">
                                <div className="tb-tnx-total">
                                  <span className="amount">${item.total}</span>
                                </div>
                                <div className="tb-tnx-status">
                                  <Badge
                                    className="badge-dot"
                                    color={
                                      item.status === "Paid" ? "success" : item.status === "Due" ? "warning" : "danger"
                                    }
                                  >
                                    {item.status}
                                  </Badge>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      : null}
                </tbody>
            </table>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Dashboard;

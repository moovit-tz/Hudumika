import React, { useState } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import CopyToClipboard from "react-copy-to-clipboard";
import Slider from "react-slick";
import { Link } from "react-router-dom";
import { Button, Card, Col, DropdownItem, DropdownMenu, DropdownToggle, Row, UncontrolledDropdown } from "reactstrap";
import {
  Block,
  BlockBetween,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
  PreviewAltCard,
  TooltipComponent,
} from "@/components/Component";
import { ReferralCharts } from "@/components/partials/charts/panel/PanelCharts";

const settings = {
  dots: true,
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  arrows: false,
};

const Overview = () => {
  const [referral, setReferral] = useState("7");
  const [copy, setCopy] = useState(false);

  const onCopyClick = () => {
    setCopy(true);
    setTimeout(() => setCopy(false), 2000);
  };

  return (
    <React.Fragment>
      <Head title="Investment Dashboard"></Head>
      <Content size="lg">
        <BlockHead>
          <BlockBetween className="g-3">
            <BlockHeadContent>
              <BlockHeadSub>Welcome!</BlockHeadSub>
              <div className="align-center flex-wrap pb-2 gx-4 gy-3">
                <div>
                  <BlockTitle tag="h2" className="fw-normal">
                    Abu Bin Ishtiyak
                  </BlockTitle>
                </div>
                <div>
                  <Link to={`/invest/schemes`} className="btn btn-white btn-light">
                    My Plans <Icon name="arrow-long-right" className="ms-2"></Icon>
                  </Link>
                </div>
              </div>
              <BlockDes>
                <p>At a glance summary of your investment account. Have fun!</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent className="d-none d-md-block">
              <div className="nk-slider nk-slider-s1">
                <Slider {...settings}>
                  <div className="nk-iv-wg1">
                    <div className="nk-iv-wg1-sub sub-text">My Active Plans</div>
                    <h6 className="nk-iv-wg1-info title">Silver - 4.76% for 21 Days</h6>
                    <a href="#slide" onClick={(ev) => ev.preventDefault()} className="nk-iv-wg1-link link link-light">
                      <Icon name="trend-up"></Icon> <span>Check Details</span>
                    </a>
                    <div className="nk-iv-wg1-progress">
                      <div className="progress-bar bg-primary" style={{ width: "50%" }}></div>
                    </div>
                  </div>
                  <div className="nk-iv-wg1">
                    <div className="nk-iv-wg1-sub sub-text">My Active Plans</div>
                    <h6 className="nk-iv-wg1-info title">Gold - 10.76% for 7 Days</h6>
                    <a href="#slide" onClick={(ev) => ev.preventDefault()} className="nk-iv-wg1-link link link-light">
                      <Icon name="trend-up"></Icon> <span>Check Details</span>
                    </a>
                    <div className="nk-iv-wg1-progress">
                      <div className="progress-bar bg-primary" style={{ width: "20%" }}></div>
                    </div>
                  </div>
                  <div className="nk-iv-wg1">
                    <div className="nk-iv-wg1-sub sub-text">My Active Plans</div>
                    <h6 className="nk-iv-wg1-info title">Platinum - 12.76% for 30 Days</h6>
                    <a href="#slide" onClick={(ev) => ev.preventDefault()} className="nk-iv-wg1-link link link-light">
                      <Icon name="trend-up"></Icon> <span>Check Details</span>
                    </a>
                    <div className="nk-iv-wg1-progress">
                      <div className="progress-bar bg-primary" style={{ width: "80%" }}></div>
                    </div>
                  </div>
                </Slider>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <PreviewAltCard className="card-bordered nk-news">
            <div className="nk-news-list">
              <a className="nk-news-item" href="#news" onClick={(ev) => ev.preventDefault()}>
                <div className="nk-news-icon">
                  <Icon name="card-view"></Icon>
                </div>
                <div className="nk-news-text">
                  <p>
                    Do you know the latest update of 2021? <span> A overview of our is now available on YouTube</span>
                  </p>
                  <Icon name="external"></Icon>
                </div>
              </a>
            </div>
          </PreviewAltCard>
        </Block>

        <Block>
          <Row className="gy-gs">
            <Col md="6" lg="4">
              <PreviewAltCard className="card-bordered is-dark nk-wg-card">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">
                      Available Balance <Icon name="info"></Icon>
                    </h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount">
                      {" "}
                      105.94{" "}
                      <span className="change up">
                        <span className="sign"></span>3.4%
                      </span>
                    </div>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
            <Col md="6" lg="4">
              <PreviewAltCard className="card-bordered is-s1 nk-wg-card">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">
                      Total Invested <Icon name="info"></Icon>
                    </h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount">
                      {" "}
                      509,850.90{" "}
                      <span className="change up">
                        <span className="sign"></span>2.8%
                      </span>
                    </div>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
            <Col md="12" lg="4">
              <PreviewAltCard className="card-bordered is-s3 nk-wg-card">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">
                      Total Profits <Icon name="info"></Icon>
                    </h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount">
                      {" "}
                      50,600.48{" "}
                      <span className="change down">
                        <span className="sign"></span>1.4%
                      </span>
                    </div>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
          </Row>
        </Block>
        <Block>
          <Row className="gy-gs">
            <Col md="6" lg="4">
              <PreviewAltCard className="nk-wg-card card-bordered h-100" bodyClass="h-100">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">Balance in Account</h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount ui-v2">12,587.96</div>
                    <ul className="nk-iv-wg2-list">
                      <li>
                        <span className="item-label">Available Funds</span>
                        <span className="item-value">105.94</span>
                      </li>
                      <li>
                        <span className="item-label">Invested Funds</span>
                        <span className="item-value">12,582.02</span>
                      </li>
                      <li className="total">
                        <span className="item-label">Total</span>
                        <span className="item-value">12,587.96</span>
                      </li>
                    </ul>
                  </div>
                  <div className="nk-iv-wg2-cta">
                    <Button className="btn-block" color="primary" size="lg">
                      {" "}
                      Withdraw Funds
                    </Button>
                    <a href="#btn" onClick={(ev) => ev.preventDefault()} className="btn btn-trans btn-block">
                      Deposit Funds
                    </a>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
            <Col md="6" lg="4">
              <PreviewAltCard className="nk-wg-card card-bordered h-100" bodyClass="h-100">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">
                      This Month Profit <Icon name="info" className="text-primary"></Icon>
                    </h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount ui-v2">
                      1,457.23{" "}
                      <span className="change up">
                        <span className="sign"></span>4.5%
                      </span>
                    </div>
                    <ul className="nk-iv-wg2-list">
                      <li>
                        <span className="item-label">Profits</span>
                        <span className="item-value">1,045.21</span>
                      </li>
                      <li>
                        <span className="item-label">Referrals</span>
                        <span className="item-value">212.02</span>
                      </li>
                      <li>
                        <span className="item-label">Rewards</span>
                        <span className="item-value">200.00</span>
                      </li>
                      <li className="total">
                        <span className="item-label">Total Profit</span>
                        <span className="item-value">1,457.23</span>
                      </li>
                    </ul>
                  </div>
                  <div className="nk-iv-wg2-cta">
                    <Button className="btn-block" color="primary" size="lg">
                      Invest &amp; Earn
                    </Button>
                    <div className="cta-extra">
                      Earn up to 25${" "}
                      <a href="#link" onClick={(ev) => ev.preventDefault()} className="link link-dark">
                        Refer friend!
                      </a>
                    </div>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
            <Col md="12" lg="4">
              {" "}
              <PreviewAltCard className="nk-wg-card card-bordered h-100" bodyClass="h-100">
                <div className="nk-iv-wg2">
                  <div className="nk-iv-wg2-title">
                    <h6 className="title">My Investment</h6>
                  </div>
                  <div className="nk-iv-wg2-text">
                    <div className="nk-iv-wg2-amount ui-v2">
                      319 <span className="sub">03</span> Active
                    </div>
                    <ul className="nk-iv-wg2-list">
                      <li>
                        <span className="item-label">
                          <a href="#link" onClick={(ev) => ev.preventDefault()}>
                            Silver
                          </a>{" "}
                          <small>- 4.76% for 21 Days</small>
                        </span>
                        <span className="item-value">2,500.00</span>
                      </li>
                      <li>
                        <span className="item-label">
                          <a href="#link" onClick={(ev) => ev.preventDefault()}>
                            Silver
                          </a>{" "}
                          <small>- 4.76% for 21 Days</small>
                        </span>
                        <span className="item-value">2,000.00</span>
                      </li>
                      <li>
                        <span className="item-label">
                          <a href="#link" onClick={(ev) => ev.preventDefault()}>
                            Dimond
                          </a>{" "}
                          <small>- 14.29% for 14 Days</small>
                        </span>
                        <span className="item-value">8,000.00</span>
                      </li>
                      <li>
                        <span className="item-label">
                          <a href="#link" onClick={(ev) => ev.preventDefault()}>
                            Starter
                          </a>{" "}
                          <small>- 1.67% for 30 Days</small>
                        </span>
                        <span className="item-value">335.00</span>
                      </li>
                    </ul>
                  </div>
                  <div className="nk-iv-wg2-cta">
                    <Button className="btn-block" color="light" size="lg">
                      See all Investment
                    </Button>
                    <div className="cta-extra">
                      Check out{" "}
                      <a href="#link" onClick={(ev) => ev.preventDefault()} className="link link-dark">
                        Analytic Report
                      </a>
                    </div>
                  </div>
                </div>
              </PreviewAltCard>
            </Col>
          </Row>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="nk-refwg">
              <div className="nk-refwg-invite card-inner">
                <div className="nk-refwg-head g-3">
                  <div className="nk-refwg-title">
                    <h5 className="title">Refer Us &amp; Earn</h5>
                    <div className="title-sub">Use the bellow link to invite your friends.</div>
                  </div>
                  <div className="nk-refwg-action">
                    <Button color="primary">Invite</Button>
                  </div>
                </div>
                <div className="nk-refwg-url">
                  <div className={`form-control-wrap ${copy ? "clipboard-success" : ""}`}>
                    <CopyToClipboard
                      className="form-clip clipboard-init"
                      text="https://dashlite.net/?ref=4945KD48"
                      onCopy={onCopyClick}
                    >
                      <div>
                        <Icon name="copy" className="clipboard-icon"></Icon>
                        <span className="clipboard-text">{copy ? "Copied" : "Copy"}</span>
                      </div>
                    </CopyToClipboard>
                    <div className="form-icon">
                      <Icon name="link-alt"></Icon>
                    </div>
                    <input
                      type="text"
                      className="form-control copy-text"
                      id="refUrl"
                      defaultValue="https://dashlite.net/?ref=4945KD48"
                    ></input>
                  </div>
                </div>
              </div>
              <div className="nk-refwg-stats card-inner bg-lighter">
                <div className="nk-refwg-group g-3">
                  <div className="nk-refwg-name">
                    <h6 className="title">
                      My Referral{" "}
                      <TooltipComponent icon="info" id="referral-data" direction="right" text="Referral Information" />
                    </h6>
                  </div>
                  <div className="nk-refwg-info g-3">
                    <div className="nk-refwg-sub">
                      <div className="title">{referral === "7" ? "394" : referral === "15" ? "490" : "720"}</div>
                      <div className="sub-text">Total Joined</div>
                    </div>
                    <div className="nk-refwg-sub">
                      <div className="title">
                        {referral === "7" ? "548.49" : referral === "15" ? "720.25" : "860.36"}
                      </div>
                      <div className="sub-text">Referral Earn</div>
                    </div>
                  </div>
                  <UncontrolledDropdown className="nk-refwg-more mt-n1 me-n1">
                    <DropdownToggle className="btn btn-icon btn-trigger" color="transparent" tag="a">
                      <Icon name="more-h"></Icon>
                    </DropdownToggle>
                    <DropdownMenu className="dropdown-menu-xs" end>
                      <ul className="link-list-plain sm">
                        <li>
                          <DropdownItem
                            href="#link"
                            tag="a"
                            className={`${referral === "7" ? "active" : ""}`}
                            onClick={(ev) => {
                              ev.preventDefault();
                              setReferral("7");
                            }}
                          >
                            7 days
                          </DropdownItem>
                        </li>
                        <li>
                          <DropdownItem
                            href="#link"
                            tag="a"
                            className={`${referral === "15" ? "active" : ""}`}
                            onClick={(ev) => {
                              ev.preventDefault();
                              setReferral("15");
                            }}
                          >
                            15 Days
                          </DropdownItem>
                        </li>
                        <li>
                          <DropdownItem
                            href="#link"
                            tag="a"
                            className={`${referral === "30" ? "active" : ""}`}
                            onClick={(ev) => {
                              ev.preventDefault();
                              setReferral("30");
                            }}
                          >
                            30 Days
                          </DropdownItem>
                        </li>
                      </ul>
                    </DropdownMenu>
                  </UncontrolledDropdown>
                </div>
                <div className="nk-refwg-ck">
                  <ReferralCharts state={referral} />
                </div>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Overview;

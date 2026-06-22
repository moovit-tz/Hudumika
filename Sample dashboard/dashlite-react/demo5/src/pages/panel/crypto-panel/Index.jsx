import React from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import RecentActivity from "@/components/partials/panel/recent-activity/RecentActivity";
import { Button, Card, Col, DropdownItem, DropdownMenu, DropdownToggle, Row, UncontrolledDropdown } from "reactstrap";
import {
  Block,
  BlockBetween,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  BlockImage,
  BlockContent,
  Icon,
  PreviewAltCard,
} from "@/components/Component";
import { Link } from "react-router-dom";
import BalanceFlow from "@/components/partials/panel/balance-flow/BalanceFlow";
import Referral from "@/components/partials/panel/referral/Referral";

const Dashboard = () => {
  return (
    <React.Fragment>
      <Head title="Crypto Dashboard"></Head>
      <Content>
        <BlockHead>
            <BlockHeadSub>Welcome!</BlockHeadSub>
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">
                Abu Bin Ishtiyak
              </BlockTitle>
              <BlockDes>
                <p>At a glance summary of your account. Have fun!</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <ul className="nk-block-tools gx-3">
                <li>
                  <Button color="primary">
                    <span>Deposit</span> <Icon name="arrow-long-right"></Icon>
                  </Button>
                </li>
                <li>
                  <Button color="white" className="btn-light">
                    <span>Buy / Sell</span> <Icon name="arrow-long-right" className="d-none d-sm-inline-block"></Icon>
                  </Button>
                </li>
                <li>
                  <UncontrolledDropdown className="opt-menu-md">
                    <DropdownToggle tag="a" className="btn btn-white btn-light btn-icon">
                      <Icon name="setting"></Icon>
                    </DropdownToggle>
                    <DropdownMenu end>
                      <ul className="link-list-opt no-bdr">
                        <li>
                          <DropdownItem tag="a">
                            <Icon name="coin-alt"></Icon>
                            <span>Curreny Settings</span>
                          </DropdownItem>
                        </li>
                        <li>
                          <DropdownItem tag="a">
                            <Icon name="notify"></Icon>
                            <span>Push Notification</span>
                          </DropdownItem>
                        </li>
                      </ul>
                    </DropdownMenu>
                  </UncontrolledDropdown>
                </li>
              </ul>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Row className="gy-gs">
            <Col lg="5" xl="4">
              <Block>
                <BlockHead size="xs">
                  <BlockHeadContent>
                    <BlockTitle tag="h5">Overview</BlockTitle>
                  </BlockHeadContent>
                </BlockHead>
                <Block>
                  <PreviewAltCard className="text-light is-dark h-100">
                    <div className="nk-wg7">
                      <div className="nk-wg7-stats">
                        <div className="nk-wg7-title">Available balance in USD</div>
                        <div className="number-lg amount">179,850.950</div>
                      </div>
                      <div className="nk-wg7-stats-group">
                        <div className="nk-wg7-stats w-50">
                          <div className="nk-wg7-title">Wallets</div>
                          <div className="number-lg">5</div>
                        </div>
                        <div className="nk-wg7-stats w-50">
                          <div className="nk-wg7-title">Transactions</div>
                          <div className="number">34,405</div>
                        </div>
                      </div>
                      <div className="nk-wg7-foot">
                        <span className="nk-wg7-note">
                          Last activity at <span>19 Nov, 2019</span>
                        </span>
                      </div>
                    </div>
                  </PreviewAltCard>
                </Block>
              </Block>
            </Col>
            <Col lg="7" xl="8">
              <Block>
                <BlockHead size="xs">
                  <BlockBetween size="md" className="g-2">
                    <BlockHeadContent>
                      <BlockTitle tag="h5">Digital Wallets</BlockTitle>
                    </BlockHeadContent>
                    <BlockHeadContent>
                      <Link to={`/crypto/wallets`} className="link link-primary">
                        See All
                      </Link>
                    </BlockHeadContent>
                  </BlockBetween>
                </BlockHead>
                <Row className="g-2">
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-btc"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">NioWallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              4.434953<span className="currency currency-nio">NIO</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-btc"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">Bitcoin Wallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              4.434953<span className="currency currency-btc">BTC</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-eth"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">Ethereum Wallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              0.000560<span className="currency currency-eth">ETH</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Block>
              <Block size="nk-block-md">
                <BlockHead size="xs">
                  <BlockBetween size="md" className="g-2">
                    <BlockHeadContent>
                      <BlockTitle tag="h6">Fiat Accounts</BlockTitle>
                    </BlockHeadContent>
                    <BlockHeadContent>
                      <Link to={`/crypto/wallets`} className="link link-primary">
                        See All
                      </Link>
                    </BlockHeadContent>
                  </BlockBetween>
                </BlockHead>
                <Row className="g-2">
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-btc"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">NioWallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              4.434953<span className="currency currency-nio">NIO</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-btc"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">Bitcoin Wallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              4.434953<span className="currency currency-btc">BTC</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                  <Col sm="4">
                    <Card className="bg-light">
                      <div className="nk-wgw sm">
                        <Link className="nk-wgw-inner" to={`/crypto/walletsbtc`}>
                          <div className="nk-wgw-name">
                            <div className="nk-wgw-icon">
                              <Icon name="sign-eth"></Icon>
                            </div>
                            <h5 className="nk-wgw-title title">Ethereum Wallet</h5>
                          </div>
                          <div className="nk-wgw-balance">
                            <div className="amount">
                              0.000560<span className="currency currency-eth">ETH</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Block>
            </Col>
          </Row>
        </Block>

        <Block size="lg">
          <Row className="gy-gs">
            <Col md="6">
              {" "}
              <RecentActivity />
            </Col>
            <Col md="6">
              <BalanceFlow />
            </Col>
          </Row>
        </Block>

        <Block>
          <Referral />
        </Block>

        <Block>
          <PreviewAltCard className="card-bordered" bodyClass="card-inner-lg">
            <div className="align-center flex-wrap flex-md-nowrap g-4">
              <BlockImage classNames="w-120px flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 118">
                  <path
                    d="M8.916,94.745C-.318,79.153-2.164,58.569,2.382,40.578,7.155,21.69,19.045,9.451,35.162,4.32,46.609.676,58.716.331,70.456,1.845,84.683,3.68,99.57,8.694,108.892,21.408c10.03,13.679,12.071,34.71,10.747,52.054-1.173,15.359-7.441,27.489-19.231,34.494-10.689,6.351-22.92,8.733-34.715,10.331-16.181,2.192-34.195-.336-47.6-12.281A47.243,47.243,0,0,1,8.916,94.745Z"
                    transform="translate(0 -1)"
                    fill="#f6faff"
                  ></path>
                  <rect x="18" y="32" width="84" height="50" rx="4" ry="4" fill="#fff"></rect>
                  <rect x="26" y="44" width="20" height="12" rx="1" ry="1" fill="#e5effe"></rect>
                  <rect x="50" y="44" width="20" height="12" rx="1" ry="1" fill="#e5effe"></rect>
                  <rect x="74" y="44" width="20" height="12" rx="1" ry="1" fill="#e5effe"></rect>
                  <rect x="38" y="60" width="20" height="12" rx="1" ry="1" fill="#e5effe"></rect>
                  <rect x="62" y="60" width="20" height="12" rx="1" ry="1" fill="#e5effe"></rect>
                  <path
                    d="M98,32H22a5.006,5.006,0,0,0-5,5V79a5.006,5.006,0,0,0,5,5H52v8H45a2,2,0,0,0-2,2v4a2,2,0,0,0,2,2H73a2,2,0,0,0,2-2V94a2,2,0,0,0-2-2H66V84H98a5.006,5.006,0,0,0,5-5V37A5.006,5.006,0,0,0,98,32ZM73,94v4H45V94Zm-9-2H54V84H64Zm37-13a3,3,0,0,1-3,3H22a3,3,0,0,1-3-3V37a3,3,0,0,1,3-3H98a3,3,0,0,1,3,3Z"
                    transform="translate(0 -1)"
                    fill="#798bff"
                  ></path>
                  <path
                    d="M61.444,41H40.111L33,48.143V19.7A3.632,3.632,0,0,1,36.556,16H61.444A3.632,3.632,0,0,1,65,19.7V37.3A3.632,3.632,0,0,1,61.444,41Z"
                    transform="translate(0 -1)"
                    fill="#6576ff"
                  ></path>
                  <path
                    d="M61.444,41H40.111L33,48.143V19.7A3.632,3.632,0,0,1,36.556,16H61.444A3.632,3.632,0,0,1,65,19.7V37.3A3.632,3.632,0,0,1,61.444,41Z"
                    transform="translate(0 -1)"
                    fill="none"
                    stroke="#6576ff"
                    strokeMiterlimit="10"
                    strokeWidth="2"
                  ></path>
                  <line
                    x1="40"
                    y1="22"
                    x2="57"
                    y2="22"
                    fill="none"
                    stroke="#fffffe"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  ></line>
                  <line
                    x1="40"
                    y1="27"
                    x2="57"
                    y2="27"
                    fill="none"
                    stroke="#fffffe"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  ></line>
                  <line
                    x1="40"
                    y1="32"
                    x2="50"
                    y2="32"
                    fill="none"
                    stroke="#fffffe"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  ></line>
                  <line
                    x1="30.5"
                    y1="87.5"
                    x2="30.5"
                    y2="91.5"
                    fill="none"
                    stroke="#9cabff"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></line>
                  <line
                    x1="28.5"
                    y1="89.5"
                    x2="32.5"
                    y2="89.5"
                    fill="none"
                    stroke="#9cabff"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></line>
                  <line
                    x1="79.5"
                    y1="22.5"
                    x2="79.5"
                    y2="26.5"
                    fill="none"
                    stroke="#9cabff"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></line>
                  <line
                    x1="77.5"
                    y1="24.5"
                    x2="81.5"
                    y2="24.5"
                    fill="none"
                    stroke="#9cabff"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></line>
                  <circle cx="90.5" cy="97.5" r="3" fill="none" stroke="#9cabff" strokeMiterlimit="10"></circle>
                  <circle cx="24" cy="23" r="2.5" fill="none" stroke="#9cabff" strokeMiterlimit="10"></circle>
                </svg>
              </BlockImage>
              <BlockContent>
                <BlockHeadContent className="px-lg-4">
                  <h5>We’re here to help you!</h5>
                  <p className="text-soft">
                    Ask a question or file a support ticket, manage request, report an issues. Our team support team
                    will get back to you by email.
                  </p>
                </BlockHeadContent>
              </BlockContent>
              <BlockContent className="flex-shrink-0">
                <Button size="lg" outline color="primary">
                  Get Support Now
                </Button>
              </BlockContent>
            </div>
          </PreviewAltCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Dashboard;

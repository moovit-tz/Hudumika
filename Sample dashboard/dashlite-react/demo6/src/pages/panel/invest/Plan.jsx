import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Link } from "react-router-dom";
import {
  Block,
  BlockBetween,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
  TooltipComponent,
} from "@/components/Component";
import { Button, Card, Col, DropdownItem, DropdownMenu, DropdownToggle, Row, UncontrolledDropdown } from "reactstrap";
import { ProfitCharts } from "@/components/partials/charts/panel/PanelCharts";

const Plan = () => {
  return (
    <React.Fragment>
      <Head title="Investment Scheme"></Head>
      <Content size="lg">
        <BlockHead>
          <BlockHeadContent>
            <BlockHeadSub>My Plan</BlockHeadSub>
            <BlockBetween size="md" className="g-4">
              <BlockHeadContent>
                <BlockTitle tag="h2" className="fw-normal">
                  Invested Schemes
                </BlockTitle>
                <BlockDes>
                  <p>Here is your current balance and your active investement plans.</p>
                </BlockDes>
              </BlockHeadContent>
              <BlockHeadContent>
                <ul className="nk-block-tools gx-3">
                  <li>
                    <Button color="primary">
                      <span>Withdraw</span> <Icon name="arrow-long-right" className="d-none d-sm-inline-block"></Icon>
                    </Button>
                  </li>
                  <li>
                    <Button color="white" className="btn-light">
                      <span>Invest More</span>{" "}
                      <Icon name="arrow-long-right" className="d-none d-sm-inline-block"></Icon>
                    </Button>
                  </li>
                  <li className="opt-menu-md">
                    <UncontrolledDropdown>
                      <DropdownToggle
                        className="btn btn-white btn-light btn-icon"
                        tag="a"
                        href="#toggle"
                        onClick={(ev) => ev.preventDefault()}
                      >
                        <Icon name="setting"></Icon>
                      </DropdownToggle>
                      <DropdownMenu end>
                        <ul className="link-list-opt no-bdr">
                          <li>
                            <DropdownItem tag="a" href="#item" onClick={(ev) => ev.preventDefault()}>
                              <Icon name="coin-alt"></Icon>
                              <span>Curreny Settings</span>
                            </DropdownItem>
                          </li>
                          <li>
                            <DropdownItem tag="a" href="#item" onClick={(ev) => ev.preventDefault()}>
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
            </BlockBetween>
          </BlockHeadContent>
        </BlockHead>

        <Block size="lg">
          <Card className="card-bordered">
            <div className="card-inner-group">
              <div className="card-inner">
                <Row className="gy-gs">
                  <Col lg="5">
                    <div className="nk-iv-wg3">
                      <div className="nk-iv-wg3-title">Total Balance</div>
                      <div className="nk-iv-wg3-group  flex-lg-nowrap gx-4">
                        <div className="nk-iv-wg3-sub">
                          <div className="nk-iv-wg3-amount">
                            <div className="number">
                              18,752.84 <small className="currency currency-usd">USD</small>
                            </div>
                          </div>
                          <div className="nk-iv-wg3-subtitle">Available Balance</div>
                        </div>
                        <div className="nk-iv-wg3-sub">
                          <span className="nk-iv-wg3-plus text-soft">
                            <Icon name="plus"></Icon>
                          </span>
                          <div className="nk-iv-wg3-amount">
                            <div className="number-sm">1,500.05</div>
                          </div>
                          <div className="nk-iv-wg3-subtitle">
                            Locked Balance{" "}
                            <TooltipComponent
                              icon="info-fill"
                              direction="right"
                              text="You can't user"
                              id="ref-lock-balance"
                            ></TooltipComponent>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Col>
                  <Col lg="7">
                    <div className="nk-iv-wg3">
                      <div className="nk-iv-wg3-title">
                        This Month{" "}
                        <TooltipComponent
                          icon="info-fill"
                          direction="right"
                          text="Current Month Profit"
                          id="month-profit"
                        ></TooltipComponent>
                      </div>
                      <div className="nk-iv-wg3-group flex-md-nowrap g-4">
                        <div className="nk-iv-wg3-sub-group gx-4">
                          <div className="nk-iv-wg3-sub">
                            <div className="nk-iv-wg3-amount">
                              <div className="number">5,394.62</div>
                            </div>
                            <div className="nk-iv-wg3-subtitle">Total Profit</div>
                          </div>
                          <div className="nk-iv-wg3-sub">
                            <span className="nk-iv-wg3-plus text-soft">
                              <Icon name="plus"></Icon>
                            </span>
                            <div className="nk-iv-wg3-amount">
                              <div className="number-sm">1,50.05</div>
                            </div>
                            <div className="nk-iv-wg3-subtitle">Today Profit</div>
                          </div>
                        </div>
                        <div className="nk-iv-wg3-sub flex-grow-1 ms-md-3">
                          <div className="nk-iv-wg3-ck">
                            <ProfitCharts />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Col>
                </Row>
              </div>
              <div className="card-inner">
                <ul className="nk-iv-wg3-nav">
                  <li>
                    <a href="#nav" onClick={(ev) => ev.preventDefault()}>
                      <Icon name="notes-alt"></Icon> <span>Go to Transaction</span>
                    </a>
                  </li>
                  <li>
                    <a href="#nav" onClick={(ev) => ev.preventDefault()}>
                      <Icon name="growth"></Icon> <span>Analytic Reports</span>
                    </a>
                  </li>
                  <li>
                    <a href="#nav" onClick={(ev) => ev.preventDefault()}>
                      <Icon name="report-profit"></Icon> <span>Monthly Statement</span>
                    </a>
                  </li>
                  <li>
                    <a href="#nav" onClick={(ev) => ev.preventDefault()}>
                      <Icon name="help"></Icon> <span>Investment Tips</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </Block>

        <Block size="lg">
          <BlockHead size="sm">
            <BlockTitle tag="h5">
              Active Plan <span className="count text-base">(2)</span>
            </BlockTitle>
          </BlockHead>
          <div className="nk-iv-scheme-list">
            <div className="nk-iv-scheme-item">
              <div className="nk-iv-scheme-icon is-running">
                <Icon name="update"></Icon>
              </div>
              <div className="nk-iv-scheme-info">
                <div className="nk-iv-scheme-name">Silver - Daily 4.76% for 21 Days</div>
                <div className="nk-iv-scheme-desc">
                  Invested Amount - <span className="amount">$250</span>
                </div>
              </div>
              <div className="nk-iv-scheme-term">
                <div className="nk-iv-scheme-start nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Start Date</span>
                  <span className="nk-iv-scheme-value date">Nov 04, 2019</span>
                </div>
                <div className="nk-iv-scheme-end nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">End Date</span>
                  <span className="nk-iv-scheme-value date">Nov 25, 2019</span>
                </div>
              </div>
              <div className="nk-iv-scheme-amount">
                <div className="nk-iv-scheme-amount-a nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Total Return</span>
                  <span className="nk-iv-scheme-value amount">$ 499.99</span>
                </div>
                <div className="nk-iv-scheme-amount-b nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Net Profit Earn</span>
                  <span className="nk-iv-scheme-value amount">
                    $ 97.95 <span className="amount-ex">~ $152.04</span>
                  </span>
                </div>
              </div>
              <div className="nk-iv-scheme-more">
                <Link
                  className="btn btn-icon btn-lg btn-round btn-trans"
                  to={`/invest/scheme-details/plan-v-1`}
                >
                  <Icon name="forward-ios"></Icon>
                </Link>
              </div>
              <div className="nk-iv-scheme-progress">
                <div className="progress-bar" style={{ width: "25%" }}></div>
              </div>
            </div>
            <div className="nk-iv-scheme-item">
              <div className="nk-iv-scheme-icon is-running">
                <Icon name="update"></Icon>
              </div>
              <div className="nk-iv-scheme-info">
                <div className="nk-iv-scheme-name">Silver - Daily 4.76% for 21 Days</div>
                <div className="nk-iv-scheme-desc">
                  Invested Amount - <span className="amount">$1,250</span>
                </div>
              </div>
              <div className="nk-iv-scheme-term">
                <div className="nk-iv-scheme-start nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Start Date</span>
                  <span className="nk-iv-scheme-value date">Oct 30, 2019</span>
                </div>
                <div className="nk-iv-scheme-end nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">End Date</span>
                  <span className="nk-iv-scheme-value date">Nov 19, 2019</span>
                </div>
              </div>
              <div className="nk-iv-scheme-amount">
                <div className="nk-iv-scheme-amount-a nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Total Return</span>
                  <span className="nk-iv-scheme-value amount">$ 2,500</span>
                </div>
                <div className="nk-iv-scheme-amount-b nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Net Profit Earn</span>
                  <span className="nk-iv-scheme-value amount">
                    $ 1145.25 <span className="amount-ex">~ $105.75</span>
                  </span>
                </div>
              </div>
              <div className="nk-iv-scheme-more">
                <Link
                  className="btn btn-icon btn-lg btn-round btn-trans"
                  to={`/invest/scheme-details/plan-v-2`}
                >
                  <Icon name="forward-ios"></Icon>
                </Link>
              </div>
              <div className="nk-iv-scheme-progress">
                <div className="progress-bar" style={{ width: "90%" }}></div>
              </div>
            </div>
          </div>
        </Block>

        <Block>
          <BlockHead size="sm">
            <BlockBetween>
              <BlockHeadContent>
                <BlockTitle tag="h5">
                  Recent Ended <span className="count text-base">(1)</span>
                </BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent>
                <a href="#link" onClick={(ev) => ev.preventDefault()}>
                  <Icon name="dot-box"></Icon> Go to Archive
                </a>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>
          <div className="nk-iv-scheme-list">
            <div className="nk-iv-scheme-item">
              <div className="nk-iv-scheme-icon is-done">
                <Icon name="offer"></Icon>
              </div>
              <div className="nk-iv-scheme-info">
                <div className="nk-iv-scheme-name">Silver - Daily 4.76% for 21 Days</div>
                <div className="nk-iv-scheme-desc">
                  Invested Amount - <span className="amount">$250</span>
                </div>
              </div>
              <div className="nk-iv-scheme-term">
                <div className="nk-iv-scheme-start nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Start Date</span>
                  <span className="nk-iv-scheme-value date">Nov 04, 2019</span>
                </div>
                <div className="nk-iv-scheme-end nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">End Date</span>
                  <span className="nk-iv-scheme-value date">Nov 25, 2019</span>
                </div>
              </div>
              <div className="nk-iv-scheme-amount">
                <div className="nk-iv-scheme-amount-a nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Total Return</span>
                  <span className="nk-iv-scheme-value amount">$ 499.99</span>
                </div>
                <div className="nk-iv-scheme-amount-b nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Net Profit Earn</span>
                  <span className="nk-iv-scheme-value amount">
                    $ 97.95 <span className="amount-ex">~ $152.04</span>
                  </span>
                </div>
              </div>
              <div className="nk-iv-scheme-more">
                <Link
                  className="btn btn-icon btn-lg btn-round btn-trans"
                  to={`/invest/scheme-details/plan-v-1`}
                >
                  <Icon name="forward-ios"></Icon>
                </Link>
              </div>
            </div>
            <div className="nk-iv-scheme-item">
              <div className="nk-iv-scheme-icon is-done">
                <Icon name="offer"></Icon>
              </div>
              <div className="nk-iv-scheme-info">
                <div className="nk-iv-scheme-name">Silver - Daily 4.76% for 21 Days</div>
                <div className="nk-iv-scheme-desc">
                  Invested Amount - <span className="amount">$1,250</span>
                </div>
              </div>
              <div className="nk-iv-scheme-term">
                <div className="nk-iv-scheme-start nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Start Date</span>
                  <span className="nk-iv-scheme-value date">Oct 30, 2019</span>
                </div>
                <div className="nk-iv-scheme-end nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">End Date</span>
                  <span className="nk-iv-scheme-value date">Nov 19, 2019</span>
                </div>
              </div>
              <div className="nk-iv-scheme-amount">
                <div className="nk-iv-scheme-amount-a nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Total Return</span>
                  <span className="nk-iv-scheme-value amount">$ 2,500</span>
                </div>
                <div className="nk-iv-scheme-amount-b nk-iv-scheme-order">
                  <span className="nk-iv-scheme-label text-soft">Net Profit Earn</span>
                  <span className="nk-iv-scheme-value amount">
                    $ 1145.25 <span className="amount-ex">~ $105.75</span>
                  </span>
                </div>
              </div>
              <div className="nk-iv-scheme-more">
                <Link
                  className="btn btn-icon btn-lg btn-round btn-trans"
                  to={`/invest/scheme-details/plan-v-2`}
                >
                  <Icon name="forward-ios"></Icon>
                </Link>
              </div>
            </div>
          </div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Plan;

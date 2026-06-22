import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import {
  BackTo,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  BlockHead,
  Block,
  Icon,
  BlockDes,
  BlockBetween,
  PreviewAltCard,
  TooltipComponent,
  Knob,
} from "@/components/Component";
import { Badge, Button, Col, Row, Card } from "reactstrap";
import { pricingTableDataV1, activePlans } from "../data";
import { dayRemainKnob, netProfitKnob, overviewKnob, transactionData } from "../data";
import { useParams } from "react-router-dom";

const InvestmentDetails = () => {
  const [currentPlan, setCurrentPlan] = useState();

  let {schemeId} = useParams();
  useEffect(() => {
    let foundEl = pricingTableDataV1.find((item) => item.id === schemeId);
    if (foundEl) {
      setCurrentPlan(foundEl);
    } else {
      let foundEl = activePlans.find((item) => item.id === schemeId);
      if (foundEl) {
        setCurrentPlan(foundEl);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const returnSum = (a1, a2) => {
    let sum = Number(a1) + a2;
    return sum.toFixed(2);
  };

  const totalReturn = () => {
    let total = returnSum(
      Number(currentPlan.minDeposit.usd * (currentPlan.interest / 100) * currentPlan.term).toFixed(2),
      currentPlan.minDeposit.usd
    );

    return total;
  };

  return (
    <React.Fragment>
      <Head title="Scheme / Plan Detail"></Head>
      <Content size="lg">
        {currentPlan && (
          <React.Fragment>
            <BlockHead>
              <BlockHeadContent>
                <BlockHeadSub>
                  <BackTo icon="arrow-left" link={`/invest/schemes`}>
                    My Investment
                  </BackTo>
                </BlockHeadSub>
              </BlockHeadContent>
              <BlockBetween size="md" className="g-4">
                <BlockHeadContent>
                  <BlockTitle tag="h2" className="fw-normal">
                    {currentPlan.title} - Daily {currentPlan.interest}% for {currentPlan.term} Days
                  </BlockTitle>
                  <BlockDes>
                    <p>
                      INV-498238{" "}
                      <Badge color="primary">
                        Running
                      </Badge>
                    </p>
                  </BlockDes>
                </BlockHeadContent>
                <BlockHeadContent>
                  <ul className="nk-block-tools gx-3">
                    <li className="order-md-last">
                      <Button color="danger">
                        <Icon name="cross"></Icon> <span>Cancel this plan</span>{" "}
                      </Button>
                    </li>
                    <li>
                      <Button color="light" className="btn-icon">
                        <Icon name="reload"></Icon>
                      </Button>
                    </li>
                  </ul>
                </BlockHeadContent>
              </BlockBetween>
            </BlockHead>

            <Block>
              <Card className="card-bordered">
                <div className="card-inner">
                  <Row className="gy-gs">
                    <Col md="6">
                      <div className="nk-iv-wg3">
                        <div className="nk-iv-wg3-group flex-lg-nowrap gx-4">
                          <div className="nk-iv-wg3-sub">
                            <div className="nk-iv-wg3-amount">
                              <div className="number">{currentPlan.minDeposit.usd.toFixed(2)}</div>
                            </div>
                            <div className="nk-iv-wg3-subtitle">Invested Amount</div>
                          </div>
                          <div className="nk-iv-wg3-sub">
                            <span className="nk-iv-wg3-plus text-soft">
                              <Icon name="plus"></Icon>
                            </span>
                            <div className="nk-iv-wg3-amount">
                              <div className="number">
                                {Number(
                                  currentPlan.minDeposit.usd * (currentPlan.interest / 100) * currentPlan.term
                                ).toFixed(2)}{" "}
                                <span className="number-up">{currentPlan.interest} %</span>
                              </div>
                            </div>
                            <div className="nk-iv-wg3-subtitle">Profit Earned</div>
                          </div>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" lg="4" className="offset-lg-2">
                      <div className="nk-iv-wg3 ps-md-3">
                        <div className="nk-iv-wg3-group flex-lg-nowrap gx-4">
                          <div className="nk-iv-wg3-sub">
                            <div className="nk-iv-wg3-amount">
                              <div className="number">
                                {totalReturn()}{" "}
                                <span className="number-down">
                                  1017.14{" "}
                                  <TooltipComponent
                                    icon="info-fill"
                                    direction="right"
                                    text="Total Return "
                                    id="total-return-invest"
                                  />
                                </span>
                              </div>
                            </div>
                            <div className="nk-iv-wg3-subtitle">Total Return</div>
                          </div>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
                <div className="nk-iv-scheme-details">
                  <ul className="nk-iv-wg3-list">
                    <li>
                      <div className="sub-text">Term</div>
                      <div className="lead-text">{currentPlan.term} Days</div>
                    </li>
                    <li>
                      <div className="sub-text">Term start at</div>
                      <div className="lead-text">{currentPlan.startDate} 05:42 AM</div>
                    </li>
                    <li>
                      <div className="sub-text">Term end at</div>
                      <div className="lead-text">{currentPlan.endDate} 05:42 AM</div>
                    </li>
                    <li>
                      <div className="sub-text">Daily interest</div>
                      <div className="lead-text">{currentPlan.interest}%</div>
                    </li>
                  </ul>
                  <ul className="nk-iv-wg3-list">
                    <li>
                      <div className="sub-text">Ordered date</div>
                      <div className="lead-text">Nov 2, 2019 10:54 PM</div>
                    </li>
                    <li>
                      <div className="sub-text">Approved date</div>
                      <div className="lead-text">{currentPlan.startDate} 05:42 AM</div>
                    </li>
                    <li>
                      <div className="sub-text">Payment method</div>
                      <div className="lead-text">NioWallet</div>
                    </li>
                    <li>
                      <div className="sub-text">
                        Paid <small>(fee include)</small>
                      </div>
                      <div className="lead-text">
                        <span className="currency currency-usd">USD</span>{" "}
                        {Number(currentPlan.minDeposit.usd + currentPlan.minDeposit.usd * 0.05).toFixed(2)}
                      </div>
                    </li>
                  </ul>
                  <ul className="nk-iv-wg3-list">
                    <li>
                      <div className="sub-text">Captial invested</div>
                      <div className="lead-text">
                        <span className="currency currency-usd">USD</span> {currentPlan.minDeposit.usd.toFixed(2)}
                      </div>
                    </li>
                    <li>
                      <div className="sub-text">Daily profit</div>
                      <div className="lead-text">
                        <span className="currency currency-usd">USD</span>{" "}
                        {Number(currentPlan.minDeposit.usd * (currentPlan.interest / 100)).toFixed(2)}
                      </div>
                    </li>
                    <li>
                      <div className="sub-text">Net profit</div>
                      <div className="lead-text">
                        <span className="currency currency-usd">USD</span>{" "}
                        {Number(currentPlan.minDeposit.usd * (currentPlan.interest / 100) * currentPlan.term).toFixed(
                          2
                        )}
                      </div>
                    </li>
                    <li>
                      <div className="sub-text">Total return</div>
                      <div className="lead-text">
                        <span className="currency currency-usd">USD</span> {totalReturn()}
                      </div>
                    </li>
                  </ul>
                </div>
              </Card>
            </Block>

            <Block size="lg">
              <BlockHead>
                <BlockTitle tag="h5">Graph view</BlockTitle>
              </BlockHead>

              <Row className="g-gs">
                <Col lg="5">
                  <PreviewAltCard className="card-bordered h-100" bodyClass="justify-center text-center h-100">
                    <div className="nk-iv-wg5">
                      <div className="nk-iv-wg5-head">
                        <h5 className="nk-iv-wg5-title">Overview</h5>
                      </div>
                      <div className="nk-iv-wg5-ck">
                        <Knob data={overviewKnob} type="half" />
                        <div className="nk-iv-wg5-ck-result">
                          <div className="text-lead">68.9%</div>
                          <div className="text-sub">112.54 / per day</div>
                        </div>
                        <div className="nk-iv-wg5-ck-minmax">
                          <span>{currentPlan.minDeposit.usd.toFixed(2)}</span>
                          <span>{totalReturn()}</span>
                        </div>
                      </div>
                    </div>
                  </PreviewAltCard>
                </Col>
                <Col className="col-lg" sm="6">
                  <PreviewAltCard className="card-bordered h-100" bodyClass="justify-center text-center h-100">
                    <div className="nk-iv-wg5">
                      <div className="nk-iv-wg5-head">
                        <h5 className="nk-iv-wg5-title">Net Profit</h5>
                        <div className="nk-iv-wg5-subtitle">
                          Earn so far{" "}
                          <strong>
                            {Number(
                              currentPlan.minDeposit.usd * (currentPlan.interest / 100) * currentPlan.term
                            ).toFixed(2)}
                          </strong>{" "}
                          <span className="currency currency-usd">USD</span>
                        </div>
                      </div>
                      <div className="nk-iv-wg5-ck sm">
                        <Knob data={netProfitKnob} type="half" />
                        <div className="nk-iv-wg5-ck-result">
                          <div className="text-lead sm">{currentPlan.interest}%</div>
                          <div className="text-sub">Daily profit</div>
                        </div>
                        <div className="nk-iv-wg5-ck-minmax">
                          <span>0.00</span>
                          <span>
                            {Number(
                              currentPlan.minDeposit.usd * (currentPlan.interest / 100) * currentPlan.term
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </PreviewAltCard>
                </Col>
                <Col className="col-lg" sm="6">
                  <PreviewAltCard className="card-bordered h-100" bodyClass="justify-center text-center h-100">
                    <div className="nk-iv-wg5">
                      <div className="nk-iv-wg5-head">
                        <h5 className="nk-iv-wg5-title">Day Remain</h5>
                        <div className="nk-iv-wg5-subtitle">
                          Earn so far <strong>1,643.76</strong> <span className="currency currency-usd">USD</span>
                        </div>
                      </div>
                      <div className="nk-iv-wg5-ck sm">
                        <Knob data={dayRemainKnob} type="half" />
                        <div className="nk-iv-wg5-ck-result">
                          <div className="text-lead sm">{currentPlan.term - 2} D</div>
                          <div className="text-sub">day remain</div>
                        </div>
                        <div className="nk-iv-wg5-ck-minmax">
                          <span>0</span>
                          <span>{currentPlan.term}</span>
                        </div>
                      </div>
                    </div>
                  </PreviewAltCard>
                </Col>
              </Row>
            </Block>
            <Block size="lg">
              <BlockHead>
                <BlockTitle tag="h5">Transactions</BlockTitle>
              </BlockHead>
              <Card className="card-bordered">
                <table className="table table-iv-tnx">
                  <thead className="table-light">
                    <tr>
                      <th className="tb-col-type">
                        <span className="overline-title">Type</span>
                      </th>
                      <th className="tb-col-date">
                        <span className="overline-title">Date</span>
                      </th>
                      <th className="tb-col-amount tb-col-end">
                        <span className="overline-title">Amount</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionData.map((item, idx) => {
                      return (
                        <tr key={idx}>
                          <td className="tb-col-type">
                            <span className="sub-text">{item.type}</span>
                          </td>
                          <td className="tb-col-date">
                            <span className="sub-text">{item.date}</span>
                          </td>
                          <td className="tb-col-amount tb-col-end">
                            <span className={`lead-text ${item.amount.split("")[0] === "-" ? "text-danger" : ""}`}>
                              {item.amount}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </Block>
          </React.Fragment>
        )}
      </Content>
    </React.Fragment>
  );
};

export default InvestmentDetails;

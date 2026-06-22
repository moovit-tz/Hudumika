import React, { useState } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import Slider from "react-slick";
import { Button, Col, Row } from "reactstrap";
import { returnCurrency } from "@/utils/Utils";
import {
  Block,
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  Icon,
} from "@/components/Component";
import { pricingTableDataV1 } from "./data";
import { SlickArrowLeft, SlickArrowRight } from "@/components/partials/slick/SlickComponents";
import { Link } from "react-router-dom";

const settings = {
  className: "slider-init plan-list",
  slidesToShow: 3,
  centerMode: false,
  slidesToScroll: 1,
  infinite: false,
  responsive: [
    { breakpoint: 1539, settings: { slidesToShow: 3 } },
    { breakpoint: 992, settings: { slidesToShow: 2 } },
    { breakpoint: 768, settings: { slidesToShow: 1 } },
  ],
  slide: "li",
  prevArrow: <SlickArrowLeft />,
  nextArrow: <SlickArrowRight />,
};

const Investment = () => {
  const [selectedCurrency, setSelectedCurrency] = useState("usd");
  const [selectedPlan, setSelectedPlan] = useState("plan-iv-1");

  return (
    <React.Fragment>
      <Head title="Investment"></Head>
      <Content size="lg">
        <BlockHead className="text-center">
          <BlockHeadContent>
            <BlockHeadSub>
              <span>Choose an Option</span>
            </BlockHeadSub>
          </BlockHeadContent>
          <BlockHeadContent>
            <BlockTitle className="fw-normal" tag="h2">
              Investment Plan
            </BlockTitle>
            <BlockDes>
              <p>Choose your investment plan and start earning.</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <form className="plan-iv">
            <div className="plan-iv-currency text-center">
              <ul className="nav nav-switch nav-tabs bg-white">
                <li className="nav-item">
                  <a
                    href="#link"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setSelectedCurrency("usd");
                    }}
                    className={`nav-link ${selectedCurrency === "usd" ? "active" : ""}`}
                  >
                    USD
                  </a>
                </li>
                <li className="nav-item">
                  <a
                    href="#link"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setSelectedCurrency("eur");
                    }}
                    className={`nav-link ${selectedCurrency === "eur" ? "active" : ""}`}
                  >
                    EUR
                  </a>
                </li>
                <li className="nav-item">
                  <a
                    href="#link"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setSelectedCurrency("btc");
                    }}
                    className={`nav-link ${selectedCurrency === "btc" ? "active" : ""}`}
                  >
                    BTC
                  </a>
                </li>
                <li className="nav-item">
                  <a
                    href="#link"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setSelectedCurrency("eth");
                    }}
                    className={`nav-link ${selectedCurrency === "eth" ? "active" : ""}`}
                  >
                    ETH
                  </a>
                </li>
              </ul>
            </div>
            <div className="plan-iv-list nk-slider nk-slider-s2">
              <Slider {...settings} slide={<li />}>
                {pricingTableDataV1.map((item) => (
                  <li className="plan-item" key={item.id} onClick={() => setSelectedPlan(item.id)}>
                    <input
                      type="radio"
                      name="plan-iv"
                      id={item.id}
                      className="plan-control"
                      defaultChecked={item.id === selectedPlan}
                      tabIndex="0"
                    />
                    <div className="plan-item-card card-bordered">
                      <div className="plan-item-head">
                        <div className="plan-item-heading">
                          <h4 className="plan-item-title card-title title">{item.title}</h4>
                          <p className="sub-text">{item.caption}</p>
                        </div>
                        <div className="plan-item-summary card-text">
                          <Row>
                            <Col className="col-6">
                              <span className="lead-text">{item.interest}%</span>
                              <span className="sub-text">Daily Interest</span>
                            </Col>
                            <Col className="col-6">
                              <span className="lead-text">{item.term}</span>
                              <span className="sub-text">Term Days</span>
                            </Col>
                          </Row>
                        </div>
                      </div>
                      <div className="plan-item-body">
                        <div className="plan-item-desc card-text">
                          <ul className="plan-item-desc-list">
                            <li>
                              <span className="desc-label">Min Deposit</span> -{" "}
                              <span className="desc-data">
                                {selectedCurrency !== "btc"
                                  ? Number(returnCurrency(selectedCurrency, item.minDeposit).value).toFixed(0) +
                                    " " +
                                    returnCurrency(selectedCurrency, item.minDeposit, true).label
                                  : Number(returnCurrency(selectedCurrency, item.minDeposit).value).toFixed(6) +
                                    " " +
                                    returnCurrency(selectedCurrency, item.minDeposit, true).label}
                              </span>
                            </li>
                            <li>
                              <span className="desc-label">Max Deposit</span> -{" "}
                              <span className="desc-data">
                                {selectedCurrency !== "btc"
                                  ? Number(returnCurrency(selectedCurrency, item.maxDeposit).value).toFixed(0) +
                                    " " +
                                    returnCurrency(selectedCurrency, item.maxDeposit, true).label
                                  : Number(returnCurrency(selectedCurrency, item.maxDeposit).value).toFixed(6) +
                                    " " +
                                    returnCurrency(selectedCurrency, item.maxDeposit, true).label}
                              </span>
                            </li>
                            <li>
                              <span className="desc-label">Deposit Return</span> -{" "}
                              <span className="desc-data">Yes</span>
                            </li>
                            <li>
                              <span className="desc-label">Total Return</span> -{" "}
                              <span className="desc-data">{item.totalReturn}%</span>
                            </li>
                          </ul>
                          <div className="plan-item-action">
                            <label htmlFor={item.id} className="plan-label">
                              <span className="plan-label-base">Choose this plan</span>
                              <span className="plan-label-selected">Plan Selected</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </Slider>
            </div>
            <div className="plan-iv-actions text-center">
              <Link to={`/invest/invest-form/${selectedPlan}`}>
                <Button color="primary" size="lg">
                  {" "}
                  <span>Continue to Invest</span> <Icon name="arrow-right"></Icon>
                </Button>
              </Link>
            </div>
          </form>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Investment;

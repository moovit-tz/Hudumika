import React, { useState, useEffect } from "react";
import Nouislider from "nouislider-react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { pricingTableDataV1 } from "../data";
import { Link ,useParams } from "react-router-dom";
import { addDays, dateFormatterAlt, returnCurrency, returnLevel } from "@/utils/Utils";
import {
  Button,
  Card,
  Col,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  
  Modal,
  ModalBody,
  ModalFooter,
  Row,
  UncontrolledDropdown,
} from "reactstrap";
import {
  BackTo,
  BlockHeadContent,
  BlockHeadSub,
  BlockTitle,
  BlockHead,
  Block,
  Icon,
} from "@/components/Component";

const InvestmentProcess = ({ match }) => {
  const [currentPlan, setCurrentPlan] = useState();
  const [currency, setCurrency] = useState("usd");
  const [rangeVal, setRangVal] = useState(100);
  const [sliderVal, setSliderVal] = useState();
  const [modal, setModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [wallet, setWallet] = useState({
    label: "NioWallet",
    value: "2.014095 BTC ( $18,934.84 )",
  });

  let {investId} = useParams();

  useEffect(() => {
    let foundEl = pricingTableDataV1.find((item) => item.id === investId);
    if (foundEl) {
      setCurrentPlan(foundEl);
      setRangVal(Number(returnCurrency(currency, foundEl.minDeposit).value).toFixed(0));
      setSliderVal(returnCurrency(currency, foundEl.minDeposit).value);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentPlan) {
      if (currency !== "btc") {
        setRangVal(Number(returnCurrency(currency, currentPlan.minDeposit).value).toFixed(0));
      } else {
        setRangVal(Number(returnCurrency(currency, currentPlan.minDeposit).value).toFixed(6));
      }
      setSliderVal(returnCurrency(currency, currentPlan.minDeposit).value);
    }
  }, [currentPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onValChange(rangeVal);
  }, [rangeVal]);

  const toggleModal = () => {
    setModal(!modal);
  };

  const toggleConfirmModal = () => {
    setConfirmModal(!confirmModal);
  };

  const calculateProfitReturns = (interest, term, principle) => {
    let value = Number(principle);
    let dailyProfit = value * (interest / 100);
    let totalNetProfit = dailyProfit * term;
    let totalReturn = totalNetProfit + value;

    return {
      dailyProfit: currency === "btc" ? dailyProfit.toFixed(6) : dailyProfit.toFixed(2),
      totalNetProfit: currency === "btc" ? totalNetProfit.toFixed(6) : totalNetProfit.toFixed(2),
      totalReturn: currency === "btc" ? totalReturn.toFixed(6) : totalReturn.toFixed(2),
    };
  };

  const calculateConversionFee = (value, fee) => {
    let invest = Number(value);
    let conversionFee = invest * (fee / 100);

    let totalFee = conversionFee + invest;

    return totalFee;
  };

  const onValChange = (val) => {
    let el = document.getElementById(`iv-amount-${Number(val).toFixed(0)}`);
    if (el) {
      el.click();
    }
  };

  return (
    <React.Fragment>
      <Head title="Investment"></Head>
      {currentPlan && (
        <Content size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockHeadSub>
                <BackTo icon="arrow-left" link={`/invest/invest`}>
                  Back to plan
                </BackTo>
              </BlockHeadSub>
            </BlockHeadContent>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">
                Ready to get started
              </BlockTitle>
            </BlockHeadContent>
          </BlockHead>

          <Block className="invest-block">
            <form className="invest-form">
              <Row className="g-gs">
                <Col lg="7">
                  <div className="form-group invest-field">
                    <input type="hidden" defaultValue="silver" name="iv-plan" id="invest-choose-plan"></input>
                    <UncontrolledDropdown className="invest-cc-dropdown">
                      <DropdownToggle
                        tag="a"
                        onClick={(ev) => ev.preventDefault()}
                        href="#toggle"
                        className="invest-cc-chosen dropdown-indicator"
                      >
                        <div className="coin-item">
                          <div className="coin-icon">
                            <Icon name="offer-fill"></Icon>
                          </div>
                          <div className="coin-info">
                            <span className="coin-name">{currentPlan.title} Plan</span>
                            <span className="coin-text">{`Invest for ${currentPlan.term} days and get daily profit ${currentPlan.interest}%`}</span>
                          </div>
                        </div>
                      </DropdownToggle>
                      <DropdownMenu className="dropdown-menu-auto dropdown-menu-mxh">
                        {pricingTableDataV1.map((item) => {
                          return (
                            <li
                              className={`invest-cc-item ${currentPlan.plan === item.title ? "selected" : ""}`}
                              onClick={() => {
                                setCurrentPlan({ ...item });
                              }}
                              key={item.id}
                            >
                              <DropdownItem
                                tag="a"
                                href="#dropdown-item"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                }}
                                className="invest-cc-opt"
                              >
                                <div className="coin-item">
                                  <div className="coin-icon">
                                    <Icon name="offer-fill"></Icon>
                                  </div>
                                  <div className="coin-info">
                                    <span className="coin-name">{item.title} Plan</span>
                                    <span className="coin-text">
                                      Invest for {item.term} days and get daily profit {item.interest}%
                                    </span>
                                  </div>
                                </div>
                              </DropdownItem>
                            </li>
                          );
                        })}
                      </DropdownMenu>
                    </UncontrolledDropdown>
                  </div>
                  <div className="form-group invest-field">
                    <div className="form-label-group">
                      <label className="form-label">Choose Quick Amount to Invest</label>
                    </div>
                    <div className="invest-amount-group g-2">
                      {returnLevel(currency, currentPlan.investLevels).map((par, index) => (
                        <div
                          className="invest-amount-item"
                          key={index}
                          onClick={() => {
                            setRangVal(par);
                            setSliderVal(par);
                          }}
                        >
                          <input
                            type="radio"
                            className="invest-amount-control"
                            name="iv-amount"
                            checked={rangeVal === par}
                            onChange={() => null}
                            id={`iv-amount-${par}`}
                          />
                          <label className="invest-amount-label" htmlFor={`iv-amount-${par}`}>
                            {currency === "btc" ? Number(par).toFixed(6) : par} {currency.toUpperCase()}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="form-group invest-field">
                    <div className="form-label-group">
                      <label className="form-label">Or Enter Your Amount</label>
                      <UncontrolledDropdown>
                        <DropdownToggle
                          tag="a"
                          onClick={(ev) => ev.preventDefault()}
                          href="#toggle"
                          className="link py-1"
                        >
                          Change Currency
                        </DropdownToggle>

                        <DropdownMenu end className="dropdown-menu-xxs">
                          <ul className="link-list-plain sm text-center">
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#toggle"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setCurrency("usd");
                                  setRangVal(`${returnCurrency("usd", currentPlan.minDeposit).value}`);
                                  setSliderVal(`${returnCurrency("usd", currentPlan.minDeposit).value}`);
                                }}
                              >
                                USD
                              </DropdownItem>
                            </li>
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#toggle"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setCurrency("eur");
                                  setRangVal(`${returnCurrency("eur", currentPlan.minDeposit).value}`);
                                  setSliderVal(`${returnCurrency("eur", currentPlan.minDeposit).value}`);
                                }}
                              >
                                EUR
                              </DropdownItem>
                            </li>
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#toggle"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setCurrency("btc");
                                  setRangVal(`${returnCurrency("btc", currentPlan.minDeposit).value}`);
                                  setSliderVal(`${returnCurrency("btc", currentPlan.minDeposit).value}`);
                                }}
                              >
                                BTC
                              </DropdownItem>
                            </li>
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#toggle"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setCurrency("eth");
                                  setRangVal(`${returnCurrency("eth", currentPlan.minDeposit).value}`);
                                  setSliderVal(`${returnCurrency("eth", currentPlan.minDeposit).value}`);
                                }}
                              >
                                ETH
                              </DropdownItem>
                            </li>
                          </ul>
                        </DropdownMenu>
                      </UncontrolledDropdown>
                    </div>
                    <div className="form-control-group">
                      <div className="form-info">{currency.toUpperCase()}</div>
                      <input
                        type="text"
                        className="form-control form-control-amount form-control-lg"
                        id="custom-amount"
                        value={currency === "btc" ? Number(rangeVal).toFixed(6) : Number(rangeVal).toFixed(0)}
                        onChange={(e) => {
                          setRangVal(e.target.value);
                          setSliderVal(e.target.value);
                          onValChange(e.target.value);
                        }}
                      />
                      <Nouislider
                        className="form-range-slider"
                        range={{
                          min: Number(returnCurrency(currency, currentPlan.minDeposit).value),
                          max: Number(returnCurrency(currency, currentPlan.maxDeposit).value),
                        }}
                        start={Number(sliderVal)}
                        behaviour="tap"
                        connect={[true, false]}
                        onChange={(val) => {
                          onValChange(val[0]);
                        }}
                        onSlide={(val) => setRangVal(val[0])}
                      />
                    </div>
                    <div className="form-note pt-2">{`Note: Minimum invest ${
                      returnCurrency(currency, currentPlan.minDeposit).value
                    } ${returnCurrency(currency, currentPlan.minDeposit, true).label} and upto ${
                      returnCurrency(currency, currentPlan.maxDeposit).value
                    } ${returnCurrency(currency, currentPlan.maxDeposit, true).label}`}</div>
                  </div>
                  <div className="form-group invest-field">
                    <div className="form-label-group">
                      <label className="form-label">Choose Payment Method</label>
                    </div>
                    <input type="hidden" defaultValue="wallet" name="iv-wallet" id="invest-choose-wallet" />
                    <UncontrolledDropdown className="invest-cc-dropdown">
                      <DropdownToggle
                        tag="a"
                        onClick={(ev) => ev.preventDefault()}
                        href="#toggle"
                        className="invest-cc-chosen dropdown-indicator"
                      >
                        <div className="coin-item">
                          <div className="coin-icon">
                            <Icon name="offer-fill"></Icon>
                          </div>
                          <div className="coin-info">
                            <span className="coin-name">{wallet.label}</span>
                            <span className="coin-text">Current balance: {wallet.value}</span>
                          </div>
                        </div>
                      </DropdownToggle>
                      <DropdownMenu className="dropdown-menu-auto dropdown-menu-mxh">
                        <li
                          className={`invest-cc-item`}
                          onClick={() => setWallet({ label: "NioWallet", value: "2.014095 BTC ( $18,934.84 )" })}
                        >
                          <DropdownItem
                            tag="a"
                            href="#dropdown-item"
                            onClick={(ev) => ev.preventDefault()}
                            className="invest-cc-opt"
                          >
                            <div className="coin-item">
                              <div className="coin-icon">
                                <Icon name="offer-fill"></Icon>
                              </div>
                              <div className="coin-info">
                                <span className="coin-name">NioWallet</span>
                                <span className="coin-text">Current balance : 2.014095 BTC ( $18,934.84 )</span>
                              </div>
                            </div>
                          </DropdownItem>
                        </li>
                        <li
                          className="invest-cc-item"
                          onClick={() => setWallet({ label: "BTC Wallet", value: " 2.014095 BTC" })}
                        >
                          <DropdownItem
                            tag="a"
                            href="#dropdown-item"
                            onClick={(ev) => ev.preventDefault()}
                            className="invest-cc-opt"
                          >
                            <div className="coin-item">
                              <div className="coin-icon">
                                <Icon name="offer-fill"></Icon>
                              </div>
                              <div className="coin-info">
                                <span className="coin-name">BTC Wallet</span>
                                <span className="coin-text">Current balance : 2.014095 BTC</span>
                              </div>
                            </div>
                          </DropdownItem>
                        </li>
                        <li
                          className="invest-cc-item"
                          onClick={() => setWallet({ label: "USD Wallet", value: " $18,934.84" })}
                        >
                          <DropdownItem
                            tag="a"
                            href="#dropdown-item"
                            onClick={(ev) => ev.preventDefault()}
                            className="invest-cc-opt"
                          >
                            <div className="coin-item">
                              <div className="coin-icon">
                                <Icon name="offer-fill"></Icon>
                              </div>
                              <div className="coin-info">
                                <span className="coin-name">USD Wallet</span>
                                <span className="coin-text">Current balance : $18,934.84</span>
                              </div>
                            </div>
                          </DropdownItem>
                        </li>
                      </DropdownMenu>
                    </UncontrolledDropdown>
                  </div>
                  <div className="form-group invest-field">
                    <div className="custom-control custom-control-xs custom-checkbox">
                      <input type="checkbox" className="custom-control-input" id="checkbox" />
                      <label className="custom-control-label" htmlFor="checkbox">
                        I agree the{" "}
                        <a href="#link" onClick={(ev) => ev.preventDefault()}>
                          terms &amp; conditions.
                        </a>
                      </label>
                    </div>
                  </div>
                </Col>
                <Col xl="4" lg="5" className="offset-xl-1">
                  <Card className="card-bordered ms-lg-4 ms-xl-0">
                    <div className="nk-iv-wg4">
                      <div className="nk-iv-wg4-sub">
                        <h6 className="nk-iv-wg4-title title">Your Investment Details</h6>
                        <ul className="nk-iv-wg4-overview g-2">
                          <li>
                            <div className="sub-text">Name of scheme</div>
                            <div className="lead-text">{currentPlan.title} Plan</div>
                          </li>
                          <li>
                            <div className="sub-text">Term of the scheme</div>
                            <div className="lead-text">{currentPlan.term} days</div>
                          </li>
                          <li>
                            <div className="sub-text">Daily profit</div>
                            <div className="lead-text">
                              {calculateProfitReturns(currentPlan.interest, currentPlan.term, rangeVal).dailyProfit}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                          <li>
                            <div className="sub-text">Daily profit %</div>
                            <div className="lead-text">{currentPlan.interest} %</div>
                          </li>
                          <li>
                            <div className="sub-text">Total net profit</div>
                            <div className="lead-text">
                              {calculateProfitReturns(currentPlan.interest, currentPlan.term, rangeVal).totalNetProfit}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                          <li>
                            <div className="sub-text">Total Return</div>
                            <div className="lead-text">
                              {calculateProfitReturns(currentPlan.interest, currentPlan.term, rangeVal).totalReturn}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                          <li>
                            <div className="sub-text">Term start at</div>
                            <div className="lead-text">Today ({dateFormatterAlt(new Date(), true)})</div>
                          </li>
                          <li>
                            <div className="sub-text">Term end at</div>
                            <div className="lead-text">
                              {dateFormatterAlt(addDays(new Date(), currentPlan.term), true)}
                            </div>
                          </li>
                        </ul>
                      </div>
                      <div className="nk-iv-wg4-sub">
                        <ul className="nk-iv-wg4-list">
                          <li>
                            <div className="sub-text">Payment Method</div>
                            <div className="lead-text">{wallet.label}</div>
                          </li>
                        </ul>
                      </div>
                      <div className="nk-iv-wg4-sub">
                        <ul className="nk-iv-wg4-list">
                          <li>
                            <div className="sub-text">Amount to invest</div>
                            <div className="lead-text">
                              {" "}
                              {currency === "btc" ? Number(rangeVal).toFixed(6) : Number(rangeVal).toFixed(2)}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                          <li>
                            <div className="sub-text">
                              Conversion Fee <span>(0.5%)</span>
                            </div>
                            <div className="lead-text">
                              {" "}
                              {currency === "btc" ? (rangeVal * 0.005).toFixed(6) : (rangeVal * 0.005).toFixed(2)}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                        </ul>
                      </div>
                      <div className="nk-iv-wg4-sub">
                        <ul className="nk-iv-wg4-list">
                          <li>
                            <div className="lead-text">Total Charge</div>
                            <div className="caption-text text-primary">
                              {currency === "btc"
                                ? calculateConversionFee(rangeVal, 0.5).toFixed(6)
                                : calculateConversionFee(rangeVal, 0.5).toFixed(2)}{" "}
                              {currency.toUpperCase()}
                            </div>
                          </li>
                        </ul>
                      </div>
                      <div className="nk-iv-wg4-sub text-center bg-lighter">
                        <Button size="lg" color="primary" className="ttu" onClick={() => toggleModal()}>
                          {" "}
                          Confirm &amp; proceed
                        </Button>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </form>
          </Block>

          <Modal isOpen={modal} toggle={() => toggleModal()} className="modal-dialog-centered" size="lg">
            <ModalBody className="modal-body-md text-center">
              <div className="nk-modal">
                <h4 className="nk-modal-title">Confirm Password</h4>
                <div className="nk-modal-text">
                  <p>
                    To confirm your payment of{" "}
                    <strong>
                      {rangeVal} {currency.toUpperCase()}
                    </strong>{" "}
                    on this order #93033939 using your <strong>{wallet.label}</strong>. Please enter your Wallet Pin
                    code in order complete the payment or cancel.
                  </p>
                </div>
                <div className="nk-modal-form">
                  <div className="form-group">
                    <input type="password" className="form-control form-control-password-big text-center" />
                  </div>
                </div>
                <div className="nk-modal-action">
                  <Button
                    color="primary"
                    size="lg"
                    className="btn-mw"
                    onClick={() => {
                      toggleModal();
                      toggleConfirmModal();
                    }}
                  >
                    Confirm Payment
                  </Button>
                  <div className="sub-text sub-text-alt mt-3 mb-4">
                    This transaction will appear on your wallet statement as Invest * {currentPlan.title.toUpperCase()}.
                  </div>
                  <a
                    href="#close"
                    onClick={(ev) => {
                      ev.preventDefault();
                      toggleModal();
                    }}
                    className="link link-soft"
                  >
                    Cancel and return
                  </a>
                </div>
              </div>
            </ModalBody>
          </Modal>

          <Modal isOpen={confirmModal} toggle={() => toggleConfirmModal()} className="modal-dialog-centered" size="lg">
            <ModalBody className="modal-body-lg text-center">
              <div className="nk-modal">
                <Icon name="check" className="nk-modal-icon icon-circle icon-circle-xxl bg-success" />
                <h4 className="nk-modal-title">Successfully Payment</h4>
                <div className="nk-modal-text">
                  <p className="sub-text">
                    You have successfully order the Investment Plan of {currentPlan.title} with amount of{" "}
                    <strong>
                      {rangeVal} {currency.toUpperCase()}
                    </strong>{" "}
                    using your <strong>{wallet.label}</strong>.
                  </p>
                </div>
                <div className="nk-modal-action-lg">
                  <ul className="btn-group flex-wrap justify-center g-4">
                    <li>
                      <Link to={`/invest/invest`} className="btn btn-lg btn-mw btn-primary">
                        More Invest
                      </Link>
                    </li>
                    <li>
                      <Link
                        to={`/invest/scheme-details/${currentPlan.id}`}
                        className="btn btn-lg btn-mw btn-dim btn-primary"
                      >
                        <Icon name="reports"></Icon>
                        <span>See the plan</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="bg-lighter">
              <div className="text-center w-100">
                <p>
                  Earn upto $25 for each friend your refer!{" "}
                  <a href="#tag" onClick={(ev) => ev.preventDefault()}>
                    Invite friends
                  </a>
                </p>
              </div>
            </ModalFooter>
          </Modal>
        </Content>
      )}
    </React.Fragment>
  );
};

export default InvestmentProcess;

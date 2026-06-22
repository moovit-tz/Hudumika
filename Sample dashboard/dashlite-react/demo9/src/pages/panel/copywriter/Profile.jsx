import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row,
  RSelect, Icon, Button } from "@/components/Component";
import classnames from "classnames";
import DatePicker from "react-datepicker";

import { countryOptions, userData } from "./data/user";
import { getDateStructured } from "@/utils/Utils";
import { Link } from "react-router-dom";
import { Card, Nav, NavItem, NavLink, TabContent, TabPane, Modal, ModalBody, Alert } from "reactstrap";

const Profile = () => {
  const urlParams = new URLSearchParams(window.location.search);
  let tabValue = urlParams.get('tab') === null ? "profile" : urlParams.get('tab').toString();

  const [activeTab, setActiveTab] = useState(tabValue);

  useEffect(() => {
    setActiveTab(tabValue);
  }, [tabValue]);

  const toggleTab = (tab) => {
    if (activeTab !== tab) setActiveTab(tab);
  }

  const [modalTab, setModalTab] = useState("1");
  const [userInfo, setUserInfo] = useState(userData);
  const [formData, setFormData] = useState({
    name: "Abu Bin Ishtiak",
    displayName: "Ishtiak",
    phone: "818474958",
    dob: "1980-08-10",
    address: "2337 Kildeer Drive",
    address2: "",
    state: "Kentucky",
    country: "Canada",
  });
  const [modalProfile, setModalProfile] = useState(false);
  const [modalChangePlan, setModalChangePlan] = useState(false);
  const [modalCancelSubscription, setModalCancelSubscription] = useState(false);
  const [promoAlert, setPromoAlert] = useState(true);

  const onInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const submitForm = () => {
    let submitData = {
      ...formData,
    };
    setUserInfo(submitData);
    setModalProfile(false);
  };

  return (
    <React.Fragment>
      <Head title="Profile"></Head>
      <Content>
        <BlockHead size="md">
          <div className="nk-block-head-sub"><span></span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="page-title">Personal Information</BlockTitle>
              <BlockDes>
                <p>Basic info, like your name and address, that you use on Nio Platform.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Card>
            <Nav tabs className="nav-tabs-s1 px-4">
              <NavItem>
                <NavLink tag="a"
                href="#tab"
                className={classnames({ active: activeTab === "profile" })}
                onClick={(ev) => {
                  ev.preventDefault();
                  toggleTab("profile");
                }}>Profile</NavLink>
              </NavItem>
              <NavItem>
                <NavLink tag="a"
                href="#tab"
                className={classnames({ active: activeTab === "billing" })}
                onClick={(ev) => {
                  ev.preventDefault();
                  toggleTab("billing");
                }}>Payment &amp; Billing</NavLink>
              </NavItem>
            </Nav>
            <div className="card-inner">
              <TabContent activeTab={activeTab} className="mt-0">
                <TabPane tabId="profile">
                  <div className="nk-data data-list">
                    <div className="data-head">
                      <h6 className="overline-title">Basics</h6>
                    </div>
                    <div className="data-item" onClick={() => setModalProfile(true)}>
                      <div className="data-col">
                        <span className="data-label">Full Name</span>
                        <span className="data-value">{userInfo.name}</span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more">
                          <Icon name="forward-ios"></Icon>
                        </span>
                      </div>
                    </div>
                    <div className="data-item" onClick={() => setModalProfile(true)}>
                      <div className="data-col">
                        <span className="data-label">Display Name</span>
                        <span className="data-value">{userInfo.displayName}</span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more">
                          <Icon name="forward-ios"></Icon>
                        </span>
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-col">
                        <span className="data-label">Email</span>
                        <span className="data-value">info@softnio.com</span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more disable">
                          <Icon name="lock-alt"></Icon>
                        </span>
                      </div>
                    </div>
                    <div className="data-item" onClick={() => setModalProfile(true)}>
                      <div className="data-col">
                        <span className="data-label">Phone Number</span>
                        <span className="data-value text-soft">{userInfo.phone}</span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more">
                          <Icon name="forward-ios"></Icon>
                        </span>
                      </div>
                    </div>
                    <div className="data-item" onClick={() => setModalProfile(true)}>
                      <div className="data-col">
                        <span className="data-label">Date of Birth</span>
                        <span className="data-value">{userInfo.dob}</span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more">
                          <Icon name="forward-ios"></Icon>
                        </span>
                      </div>
                    </div>
                    <div className="data-item" onClick={() => setModalProfile(true)}>
                      <div className="data-col">
                        <span className="data-label">Address</span>
                        <span className="data-value">
                          {userInfo.address},
                          <br />
                          {userInfo.state}, {userInfo.country}
                        </span>
                      </div>
                      <div className="data-col data-col-end">
                        <span className="data-more">
                          <Icon name="forward-ios"></Icon>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="nk-data data-list">
                    <div className="data-head">
                      <h6 className="overline-title">Preferences</h6>
                    </div>
                    <div className="data-item">
                      <div className="data-col">
                        <span className="data-label">Language</span>
                        <span className="data-value">English (United State)</span>
                      </div>
                      <div className="data-col data-col-end">
                        <a
                          href="#language"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="link link-primary"
                        >
                          Change Language
                        </a>
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-col">
                        <span className="data-label">Date Format</span>
                        <span className="data-value">MM/DD/YYYY</span>
                      </div>
                      <div className="data-col data-col-end">
                        <a
                          href="#link"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="link link-primary"
                        >
                          Change
                        </a>
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-col">
                        <span className="data-label">Timezone</span>
                        <span className="data-value">Bangladesh (GMT +6)</span>
                      </div>
                      <div className="data-col data-col-end">
                        <a
                          href="#link"
                          onClick={(ev) => {
                            ev.preventDefault();
                          }}
                          className="link link-primary"
                        >
                          Change
                        </a>
                      </div>
                    </div>
                  </div>
                  <Modal isOpen={modalProfile} className="modal-dialog-centered" size="lg" toggle={() => setModalProfile(false)}>
                    <a
                      href="#dropdownitem"
                      onClick={(ev) => {
                        ev.preventDefault();
                        setModalProfile(false);
                      }}
                      className="close"
                    >
                      <Icon name="cross-sm"></Icon>
                    </a>
                    <ModalBody>
                      <div className="p-2">
                        <h5 className="title">Update Profile</h5>
                        <ul className="nk-nav nav nav-tabs">
                          <li className="nav-item">
                            <a
                              className={`nav-link ${modalTab === "1" && "active"}`}
                              onClick={(ev) => {
                                ev.preventDefault();
                                setModalTab("1");
                              }}
                              href="#personal"
                            >
                              Personal
                            </a>
                          </li>
                          <li className="nav-item">
                            <a
                              className={`nav-link ${modalTab === "2" && "active"}`}
                              onClick={(ev) => {
                                ev.preventDefault();
                                setModalTab("2");
                              }}
                              href="#address"
                            >
                              Address
                            </a>
                          </li>
                        </ul>
                        <div className="tab-content">
                          <div className={`tab-pane ${modalTab === "1" ? "active" : ""}`} id="personal">
                            <Row className="gy-4">
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="full-name">
                                    Full Name
                                  </label>
                                  <input
                                    type="text"
                                    id="full-name"
                                    className="form-control"
                                    name="name"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.name}
                                    placeholder="Enter Full name"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="display-name">
                                    Display Name
                                  </label>
                                  <input
                                    type="text"
                                    id="display-name"
                                    className="form-control"
                                    name="displayName"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.displayName}
                                    placeholder="Enter display name"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="phone-no">
                                    Phone Number
                                  </label>
                                  <input
                                    type="number"
                                    id="phone-no"
                                    className="form-control"
                                    name="phone"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.phone}
                                    placeholder="Phone Number"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="birth-day">
                                    Date of Birth
                                  </label>
                                  <DatePicker
                                    selected={new Date(formData.dob)}
                                    className="form-control"
                                    onChange={(date) => setFormData({ ...formData, dob: getDateStructured(date) })}
                                    maxDate={new Date()}
                                  />
                                </div>
                              </Col>
                              <Col size="12">
                                <div className="custom-control custom-switch">
                                  <input type="checkbox" className="custom-control-input" id="latest-sale" />
                                  <label className="custom-control-label" htmlFor="latest-sale">
                                    Use full name to display{" "}
                                  </label>
                                </div>
                              </Col>
                              <Col size="12">
                                <ul className="align-center flex-wrap flex-sm-nowrap gx-4 gy-2">
                                  <li>
                                    <Button
                                      color="primary"
                                      size="lg"
                                      onClick={(ev) => {
                                        ev.preventDefault();
                                        submitForm();
                                      }}
                                    >
                                      Update Profile
                                    </Button>
                                  </li>
                                  <li>
                                    <a
                                      href="#dropdownitem"
                                      onClick={(ev) => {
                                        ev.preventDefault();
                                        setModalProfile(false);
                                      }}
                                      className="link link-light"
                                    >
                                      Cancel
                                    </a>
                                  </li>
                                </ul>
                              </Col>
                            </Row>
                          </div>
                          <div className={`tab-pane ${modalTab === "2" ? "active" : ""}`} id="address">
                            <Row className="gy-4">
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="address-l1">
                                    Address Line 1
                                  </label>
                                  <input
                                    type="text"
                                    id="address-l1"
                                    name="address"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.address}
                                    className="form-control"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="address-l2">
                                    Address Line 2
                                  </label>
                                  <input
                                    type="text"
                                    id="address-l2"
                                    name="address2"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.address2}
                                    className="form-control"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="address-st">
                                    State
                                  </label>
                                  <input
                                    type="text"
                                    id="address-st"
                                    name="state"
                                    onChange={(e) => onInputChange(e)}
                                    defaultValue={formData.state}
                                    className="form-control"
                                  />
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="form-group">
                                  <label className="form-label" htmlFor="address-county">
                                    Country
                                  </label>
                                  <RSelect
                                    options={countryOptions}
                                    placeholder="Select a country"
                                    defaultValue={[
                                      {
                                        value: formData.country,
                                        label: formData.country,
                                      },
                                    ]}
                                    onChange={(e) => setFormData({ ...formData, country: e.value })}
                                  />
                                </div>
                              </Col>
                              <Col size="12">
                                <ul className="align-center flex-wrap flex-sm-nowrap gx-4 gy-2">
                                  <li>
                                    <Button color="primary" size="lg" onClick={() => submitForm()}>
                                      Update Address
                                    </Button>
                                  </li>
                                  <li>
                                    <a
                                      href="#dropdownitem"
                                      onClick={(ev) => {
                                        ev.preventDefault();
                                        setModalProfile(false);
                                      }}
                                      className="link link-light"
                                    >
                                      Cancel
                                    </a>
                                  </li>
                                </ul>
                              </Col>
                            </Row>
                          </div>
                        </div>
                      </div>
                    </ModalBody>
                  </Modal>
                </TabPane>
                <TabPane tabId="billing">
                  <div className="d-flex flex-wrap align-items-center justify-content-between mb-3">
                      <h5 className="mb-0">Your Subscription</h5>
                      <ul className="d-flex gx-4">
                          <li>
                              <a className="link link-danger fw-normal" onClick={() => setModalCancelSubscription(true)} href="#cancelSubscriptionModal">Cancel Subscription</a>
                          </li>
                          <li>
                              <a className="link link-primary fw-normal" onClick={() => setModalChangePlan(true)} href="#changePlanModal">Change Plan</a>
                          </li>
                      </ul>
                  </div>
                  <Alert color="warning" className="alert-dismissible mb-4 rounded-6" closeClassName="d-none" isOpen={promoAlert} toggle={() => setPromoAlert(false)}>
                      <p className="small mb-0">Save big up to 75% on your upgrade to our <strong><a className="alert-link" href="#">Enterprise plan</a></strong> and enjoy premium features at a fraction of the cost!</p>
                      <div className="d-inline-flex position-absolute end-0 top-50 translate-middle-y me-2">
                          <Button size="xs" color="warning" className="btn-icon rounded-pill" onClick={() => setPromoAlert(false)}>
                              <em className="icon ni ni-cross"></em>
                          </Button>
                      </div>
                  </Alert>
                  <Row className="g-gs">
                      <Col xl="3" sm="6">
                          <Card>
                              <div className="card-inner">
                                  <div className="text-base mb-1">Plan</div>
                                  <h5>Professional Plan</h5>
                              </div>
                          </Card>
                      </Col>
                      <Col xl="3" sm="6">
                          <Card>
                              <div className="card-inner">
                                  <div className="text-base mb-1">Recurring Payment</div>
                                  <h5>$23/Month</h5>
                              </div>
                          </Card>
                      </Col>
                      <Col xl="3" sm="6">
                          <Card>
                              <div className="card-inner">
                                  <div className="text-base mb-1">Next Due Date</div>
                                  <h5>Mar 15, 2023</h5>
                              </div>
                          </Card>
                      </Col>
                      <Col xl="3" sm="6">
                          <Card>
                              <div className="card-inner">
                                  <div className="text-base mb-1">Payment Method</div>
                                  <h5>PayPal</h5>
                              </div>
                          </Card>
                      </Col>
                  </Row>
                  <div className="mt-4 pt-1 pb-1 mb-3">
                      <h5>Billing History</h5>
                  </div>
                  <Card>
                      <table className="table table-middle mb-0">
                          <thead className="table-light">
                              <tr>
                                  <th className="tb-col">
                                      <div className="fs-13px text-base">Subscription</div>
                                  </th>
                                  <th className="tb-col tb-col-md">
                                      <div className="fs-13px text-base">Payment Date</div>
                                  </th>
                                  <th className="tb-col tb-col-sm">
                                      <div className="fs-13px text-base">Total</div>
                                  </th>
                                  <th className="tb-col tb-col-sm">
                                      <div className="fs-13px text-base">Status</div>
                                  </th>
                                  <th className="tb-col"></th>
                              </tr>
                          </thead>
                          <tbody>
                              <tr>
                                  <td className="tb-col">
                                      <div className="caption-text">Starter - 12 Months <div className="d-sm-none dot bg-success"></div></div>
                                  </td>
                                  <td className="tb-col tb-col-md">
                                      <div className="fs-6 text-base d-inline-flex flex-wrap gap gx-2"><span>Feb 15,2023 </span> <span>02:31 PM</span></div>
                                  </td>
                                  <td className="tb-col tb-col-sm">
                                      <div className="fs-6 text-base">$23.00</div>
                                  </td>
                                  <td className="tb-col tb-col-sm">
                                      <div className="badge bg-success-dim text-success rounded-pill">Paid</div>
                                  </td>
                                  <td className="tb-col tb-col-end">
                                      <a href="#" className="link">Get Invoice</a>
                                  </td>
                              </tr>
                              <tr>
                                  <td className="tb-col">
                                      <div className="caption-text">Starter - 12 Months <div className="d-sm-none dot bg-warning"></div></div>
                                  </td>
                                  <td className="tb-col tb-col-md">
                                      <div className="fs-6 text-base d-inline-flex flex-wrap gap gx-2"><span>Feb 15,2023 </span> <span>02:31 PM</span></div>
                                  </td>
                                  <td className="tb-col tb-col-sm">
                                      <div className="fs-6 text-base">$23.00</div>
                                  </td>
                                  <td className="tb-col tb-col-sm">
                                      <div className="badge bg-warning-dim text-warning rounded-pill">Faild</div>
                                  </td>
                                  <td className="tb-col tb-col-end">
                                      <a href="#" className="link">Get Invoice</a>
                                  </td>
                              </tr>
                          </tbody>
                      </table>
                  </Card>
                  <Modal isOpen={modalChangePlan} toggle={() => setModalChangePlan(false)}>
                      <ModalBody className="p-4">
                        <div className="user-avatar md text-primary bg-primary-dim mb-3">
                            <em className="icon ni ni-spark-fill"></em>
                        </div>
                        <h4>Change Subscription</h4>
                        <p>Are you sure you want to change your subscription? Your paid plan is valid till <span className="text-dark">23 Mar, 2023</span>.</p>
                        <div className="card bg-lighter bg-opacity-80 shadow-none mt-2">
                            <div className="card-body">
                                <h5>What you will lose after changing your active subscription?</h5>
                                <ul className="list gy-2 mt-2">
                                    <li>You won’t have a dedicated account manager</li>
                                    <li>No custom tools will be existed for AI content generations.</li>
                                    <li>You’ll lose access to advance integrations.</li>
                                    <li>No prioritized support will be provided for you.</li>
                                    <li>Server response rate will be standard than faster.</li>
                                    <li>Regular model updates instead of special features early access.</li>
                                </ul>
                            </div>
                        </div>
                        <Row tag="ul" className="gx-4 mt-4">
                            <Col tag="li" size="6"><button className="btn btn-outline-light btn-block" onClick={() => setModalChangePlan(false)}>Keep Plan</button></Col>
                            <Col tag="li" size="6"><Link to={`/copywriter/pricing-plans`} className="btn btn-primary btn-block">Change Plan</Link></Col>
                        </Row>
                      </ModalBody>
                  </Modal>
                  <Modal isOpen={modalCancelSubscription} toggle={() => setModalCancelSubscription(false)}>
                      <ModalBody className="p-4">
                        <div className="user-avatar md text-danger bg-danger-dim mb-3">
                            <em className="icon ni ni-spark-fill"></em>
                        </div>
                        <h4>Cancel Subscription</h4>
                        <p>Are you sure you want to cancel your subscription? Your paid plan is valid till  <span className="text-dark">23 Mar, 2023</span>.</p>
                        <p>Don't forget to review our other <a href="@@URL/copywriter/pricing-plans.html">pricing plans</a> before cancelling your current subscription. If you still want to cancel, your account will change to a free plan.</p>
                        <div className="card bg-lighter bg-opacity-80 shadow-none mt-2">
                            <div className="card-body">
                                <h5>What you will lose after cancelling you subscription?</h5>
                                <ul className="list gy-2 mt-2">
                                    <li>All your generated in Copygen will be removed.</li>
                                    <li>You will lose access to unlimited content generation.</li>
                                    <li>You will get regular updates exclusive only for our premium users.</li>
                                    <li>Server response may become slow as we highly prioritized our premium users.</li>
                                    <li>There will be no recovery options once you cancel subscription.</li>
                                </ul>
                            </div>
                        </div>
                        <Row tag="ul" className="gx-4 mt-4">
                            <Col tag="li" size="6"><button className="btn btn-outline-light btn-block" onClick={() => setModalCancelSubscription(false)}>Keep Plan</button></Col>
                            <Col tag="li" size="6"><Link to={`/copywriter/pricing-plans`} className="btn btn-danger btn-block">I Understand, Cancel</Link></Col>
                        </Row>
                      </ModalBody>
                  </Modal>
                </TabPane>
              </TabContent>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Profile;

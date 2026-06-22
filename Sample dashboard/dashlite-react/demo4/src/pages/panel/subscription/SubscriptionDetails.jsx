import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Col, Icon, Row } from "@/components/Component";
import { Link, useParams } from "react-router-dom";
import { Card, UncontrolledDropdown, DropdownMenu, DropdownToggle,Badge, Modal, ModalBody } from "reactstrap";
import subscriptionData from "./data/subscription";
import paymentData from "./data/payments";
const payments = paymentData.slice(0,3);

import { svgData } from "@/pages/components/crafted-icons/NioIconData";
const helpSupportIcon = svgData.filter((icon) => icon.slug === "help-support")[0]

const SubscriptionDetails = () => {

  const [subscriptionCancelModal, setSubscriptionCancelModal] = useState(false);
  const [subscriptionCancelConfirmedModal, setSubscriptionCancelConfirmedModal] = useState(false);

  const [data] = useState(subscriptionData);
  const [subscription, setSubscription] = useState();

  let { subscriptionId } = useParams();

  useEffect(() => {
    const id = subscriptionId;
    if (id !== undefined || null || "") {
      let sSubscription = data.find((item) => item.id === id);
      setSubscription(sSubscription);
    } else {
      setSubscription(data[0]);
    }
  }, [subscriptionId, data]);

  
  return (
    <React.Fragment>
      <Head title="My Subscription"></Head>
      { subscription && <Content>
        <BlockHead size="lg">
            <div className="nk-block-head-sub"><Link className="back-to" to={`/subscription/subscriptions`}><Icon name="arrow-left"/><span>Subscription</span></Link></div>
            <BlockBetween size="md" className="g-4">
                <BlockHeadContent>
                <BlockTitle tag="h2" className="fw-normal">{subscription.title}</BlockTitle>
                <BlockDes>
                    <p>Your subscription renews on {" "}
                      {subscription.nextbilling ? 
                      (<>{subscription.nextbilling} <span className="text-soft">(11 months 16 days remaining)</span> <span className="text-primary"><Icon name="info" /></span> </>) 
                      : "Never"}
                    </p>
                </BlockDes>
                </BlockHeadContent>
                <BlockHeadContent>
                    <ul className="nk-block-tools justify-content-md-end g-4 flex-wrap">
                      {subscription.status === 'Active' ? <li className="order-md-last">
                          <a className="btn btn-auto btn-dim btn-danger" 
                          onClick={(ev) => {
                            ev.preventDefault();
                            setSubscriptionCancelModal(true);
                          }} 
                          ><Icon name="cross"></Icon><span>Cancel Subscription</span></a>
                      </li> : ''}
                      <li>
                          <div className="custom-control custom-switch">
                              <input type="checkbox" className="custom-control-input" defaultChecked={subscription.autorenew} disabled={subscription.status === 'Expired'} id="auto-renew" />
                              <label className="custom-control-label text-soft" htmlFor="auto-renew">Auto Renew</label>
                          </div>
                      </li>
                  </ul>
                </BlockHeadContent>
            </BlockBetween>
        </BlockHead>
        <Block>
          <Row>
            <Col xl="8">
              <Card className="card-bordered">
                <div className="card-inner-group">
                    <div className="card-inner">
                        <div className="sp-plan-head">
                            <h6 className="title">Plan Details</h6>
                        </div>

                        <div className="sp-plan-desc sp-plan-desc-mb">
                            <ul className="row gx-1">
                                <li className="col-sm-4">
                                    <p><span className="text-soft">Started On</span> {subscription.startdate}</p>
                                </li>
                                <li className="col-sm-4">
                                    <p><span className="text-soft">Price</span> {subscription.price} /Year</p>
                                </li>
                                <li className="col-sm-4">
                                    <p><span className="text-soft">Access</span> {subscription.access}</p>
                                </li> 
                            </ul>
                        </div>
                    </div>
                    <div className="card-inner">
                        <div className="sp-plan-head-group">
                            <div className="sp-plan-head">
                                <h6 className="title">Next Payment</h6>
                            </div>
                            <div className="sp-plan-amount">
                                <span className="sp-plan-status text-warning">Due</span> <span className="amount">{subscription.price}</span>
                            </div>
                        </div>
                        <div className="sp-plan-payopt">
                            <div className="cc-pay">
                                <h6 className="title">Pay With</h6>
                                <ul className="cc-pay-method">
                                    <li>
                                      <UncontrolledDropdown className="cc-pay-dd" direction="down">
                                        <DropdownToggle tag="a" className="btn btn-white btn-outline-light dropdown-toggle dropdown-indicator">
                                          <Icon name="visa"></Icon>
                                          <span><span className="cc-pay-star">**** **** ****</span> 9484</span>
                                        </DropdownToggle>
                                        <DropdownMenu className="dropdown-menu-auto">
                                          <ul className="link-list-plain">
                                            <li>
                                                <a href="#" className="cc-pay-item">
                                                    <em className="cc-pay-item-icon icon ni ni-cc-visa"></em>
                                                    <span className="cc-pay-item-name">
                                                        <span className="cc-pay-item-method"><span className="cc-pay-star">**** **** ****</span> 9484</span>
                                                        <span className="cc-pay-item-meta">Last paid Oct 12, 2018</span>
                                                    </span>
                                                </a>
                                            </li>
                                            <li>
                                                <a href="#" className="cc-pay-item">
                                                    <em className="cc-pay-item-icon icon ni ni-cc-paypal"></em>
                                                    <span className="cc-pay-item-name">
                                                        <span className="cc-pay-item-method">PayPal (info@***io.com)</span>
                                                        <span className="cc-pay-item-meta">Last paid Oct 12, 2017</span>
                                                    </span>
                                                </a>
                                            </li>
                                            <li>
                                                <a href="#" className="cc-pay-item">
                                                    <span className="cc-pay-item-name">
                                                        <span className="cc-pay-item-method-new">Add New Credit Card</span>
                                                    </span>
                                                </a>
                                            </li>
                                          </ul>
                                        </DropdownMenu>
                                      </UncontrolledDropdown>
                                    </li>
                                    <li className="cc-pay-btn">
                                        <a href="#" className="btn btn-secondary"><span>Pay Now</span> <em className="icon ni ni-arrow-long-right"></em></a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="card-inner">
                        <div className="sp-plan-head-group">
                            <div className="sp-plan-head">
                                <h6 className="title">Last Payment</h6>
                                <span className="ff-italic text-soft">Paid at {subscription.startdate}</span>
                            </div>
                            <div className="sp-plan-amount">
                                <span className="sp-plan-status text-success">Paid</span> <span className="amount">{subscription.price}</span>
                            </div>
                        </div>
                    </div>
                    <div className="card-inner">
                        <div className="sp-plan-">
                            <a href="#" className="">
                                <span><em className="icon ni ni-cc-alt"></em> Change Billing Method</span>
                                <em className="icon ni ni-arrow-right"></em>
                            </a>
                        </div>
                    </div>
                </div>
              </Card>
            </Col>
            <Col xl="4">
              <Card className="card-bordered card-bordered card-full d-none d-xl-block">
                <div className="nk-help-plain card-inner text-center">
                    <div className="nk-help-img">
                      {helpSupportIcon.svg}
                    </div>
                    <div className="nk-help-text">
                        <h5>Maintainance Support</h5>
                        <p className="text-soft">You can get additionally weekly maintainance with premium support, only <span className="ext-base">$99.00</span> per year.</p>
                    </div>
                    <div className="nk-help-action">
                      <Link to={`/subscription/contact`} className="btn btn-lg btn-primary">Get Support Now</Link>
                    </div>
                </div>
              </Card>
              <Card className="card-bordered card-bordered d-xl-none">
                <div className="card-inner">
                  <div className="nk-help">
                      <div className="nk-help-img">
                        {helpSupportIcon.svg}
                      </div>
                      <div className="nk-help-text">
                          <h5>Maintainance Support</h5>
                          <p className="text-soft">You can get additionally weekly maintainance with premium support, only <span className="ext-base">$99.00</span> per year.</p>
                      </div>
                      <div className="nk-help-action">
                          <a href="#" className="btn btn-lg btn-primary">Get Support Now</a>
                      </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner card-inner-md">
                <div className="card-title-group">
                    <h6 className="card-title">Payment History</h6>
                    <div className="card-action">
                        <Link to={`/subscription/payments`} className="link link-sm">Download Statement</Link>
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

        <Modal isOpen={subscriptionCancelModal} size="md" toggle={() => setSubscriptionCancelModal(false)}>
            <a href="#" className="close" 
                onClick={(ev) => {
                    ev.preventDefault();
                    setSubscriptionCancelModal(false);
                }}
            ><em className="icon ni ni-cross"></em></a>
            <div className="modal-body modal-body-md">
                <h4 className="nk-modal-title title">Cancel Your Subscription</h4>
                <p><strong>Are you sure you want to cancel your subscription?</strong></p>
                <p>If you cancel, you'll lose your all demand. But you can re-subscription your favourite plan any time.</p>
                <div className="form">
                    <div className="form-group">
                        <label className="form-label">Enter your password to confirm cancellation</label>
                        <div className="form-control-wrap">
                            <input type="password" className="form-control" placeholder="*********" />
                        </div>
                        <div className="form-note">
                            <span>You'll receieve confirmation email once successfully cancel your plan.</span>
                        </div>
                    </div>
                    <ul className="align-center flex-wrap g-3">
                        <li>
                            <button className="btn btn-primary"
                            onClick={(ev) => {
                                ev.preventDefault();
                                setSubscriptionCancelConfirmedModal(true);
                                setSubscriptionCancelModal(false);
                            }} 
                            >Cancel Subscription</button>
                        </li>
                        <li>
                            <a href="#" className="btn btn-light" 
                            onClick={(ev) => {
                                ev.preventDefault();
                                setSubscriptionCancelModal(false);
                            }} >Never mind, don't cancel</a>
                        </li>
                    </ul>
                </div>
            </div>
        </Modal>

        <Modal isOpen={subscriptionCancelConfirmedModal} toggle={() => setSubscriptionCancelConfirmedModal(false)}>
            <ModalBody className="modal-body-md text-center">
                <div className="nk-modal">
                    <em className="nk-modal-icon icon icon-circle icon-circle-xxl ni ni-check bg-success-dim text-success"></em>
                    <h4 className="nk-modal-title">Successfully Cancelled</h4>
                    <div className="nk-modal-text">
                        <p>It will effect at the end of your current billing cycle on <strong>01 Feb 2020</strong>. We sent you a confirmation email <strong>(this may take up to 3 hours to receive)</strong>.</p>
                        <p className="sub-text-sm"><a href="#">Click here</a> to learn more about subscription plan.</p>
                    </div>
                    <div className="nk-modal-action-lg">
                        <a href="#" className="btn btn-mw btn-light" 
                        onClick={(ev) => {
                            ev.preventDefault();
                            setSubscriptionCancelConfirmedModal(false);
                        }} >Return</a>
                    </div>
                </div>
            </ModalBody>
            <div className="modal-footer bg-lighter">
                <div className="text-center w-100">
                    <p>You can easily re-subscription your favourite plan any time.</p>
                </div>
            </div>
        </Modal>
      </Content>}
    </React.Fragment>
  );
};

export default SubscriptionDetails;
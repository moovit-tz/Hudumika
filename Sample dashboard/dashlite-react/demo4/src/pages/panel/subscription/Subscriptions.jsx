import React, {useState} from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Col, Icon, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, Badge } from "reactstrap";
import { Modal, ModalBody } from "reactstrap";
import { svgData } from "@/pages/components/crafted-icons/NioIconData";
import subscriptionData from "./data/subscription";
const helpSupportIcon = svgData.filter((icon) => icon.slug === "help-support")[0]

const Subscriptions = () => {

    const [subscriptionChangeModal, setSubscriptionChangeModal] = useState(false);
    const [subscriptionConfirmedModal, setSubscriptionConfirmedModal] = useState(false);
    const [subscriptionCancelModal, setSubscriptionCancelModal] = useState(false);
    const [subscriptionCancelConfirmedModal, setSubscriptionCancelConfirmedModal] = useState(false);

  return (
    <React.Fragment>
      <Head title="Subscriptions"></Head>
      <Content>
        <BlockHead size="lg">
            <div className="nk-block-head-sub"><span>Manage Subscription</span></div>
            <BlockBetween size="md" className="g-4">
                <BlockHeadContent>
                <BlockTitle tag="h2" className="fw-normal">My Subscriptions</BlockTitle>
                <BlockDes>
                    <p>Here is list of package/product that you have subscribed. <span className="text-primary"><Icon name="info" /></span></p>
                </BlockDes>
                </BlockHeadContent>
                <BlockHeadContent>
                    <ul className="nk-block-tools gx-3">
                        <li className="order-md-last">
                            <Link to={`/subscription/pricing`} className="btn btn-white btn-dim btn-outline-primary"><span>View Pricing</span></Link>
                        </li>
                    </ul>
                </BlockHeadContent>
            </BlockBetween>
        </BlockHead>
        <Block>
          {subscriptionData.map((item,index)=> 
            <Card key={index} className="card-bordered sp-plan">
                <Row className="no-gutters">
                <Col md="8">
                    <div className="sp-plan-info card-inner">
                        <Row className="gx-0 gy-3">
                            <Col xl="9" sm="8">
                                <div className="sp-plan-name">
                                    <h6 className="title"><Link to={`/subscription/subscription-details/${item.id}`}>{item.title} <Badge color={item.status == 'Active' ? 'success' : 'light'} className="rounded-pill">{item.status}</Badge></Link></h6>
                                    <p>Subscription ID: <span className="text-base">{item.id}</span></p>
                                </div>
                            </Col>
                            <Col xl="3" sm="4">
                                <div className="sp-plan-opt">
                                    <div className="custom-control custom-switch">
                                        <input type="checkbox" className="custom-control-input" id={`plan-id-${item.id}`} defaultChecked={item.autorenew} disabled={item.status === 'Expired'}/>
                                        <label className="custom-control-label text-soft" htmlFor={`plan-id-${item.id}`}>Auto Renew</label>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </div>
                    <div className="sp-plan-desc card-inner">
                        <Row className="gx-1">
                            <Col col="6" lg="3">
                                <p><span className="text-soft">Started On</span> {item.startdate}</p>
                            </Col>
                            <Col col="6" lg="3">
                                <p><span className="text-soft">Recuring</span> {item.recurring ? 'Yes' : 'No'}</p>
                            </Col>
                            <Col col="6" lg="3">
                                <p><span className="text-soft">Price</span> {item.price}</p>
                            </Col>
                            <Col col="6" lg="3">
                                <p><span className="text-soft">Access</span> {item.access}</p>
                            </Col> 
                        </Row>
                    </div>
                </Col>
                <Col md="4">
                    {item.status == 'Active' ? 
                        <div className="sp-plan-action card-inner">
                            <div className="sp-plan-btn">
                                <a className="btn btn-primary" onClick={() => setSubscriptionChangeModal(true)}><span>Change Plan</span></a>
                            </div>
                            <div className="sp-plan-note text-md-center">
                                <p>Next Billing on <span>{item.nextbilling}</span></p>
                            </div>
                        </div> 
                        : 
                        <div className="sp-plan-action card-inner">
                            <div className="sp-plan-btn">
                                <a href="#" className="btn btn-dim btn-white btn-outline-primary"><span>Renew Plan</span></a>
                            </div>
                            <div className="sp-plan-note text-md-center">
                            <p>You can renew the plan anytime.</p>
                            </div>
                        </div>
                    }
                </Col>
                </Row>
            </Card>
          )}
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
        <Modal isOpen={subscriptionChangeModal} size="lg" toggle={() => setSubscriptionChangeModal(false)}>
            <a href="#" onClick={(ev) => {
              ev.preventDefault();
              setSubscriptionChangeModal(false);
            }} className="close"><em className="icon ni ni-cross"></em></a>
            <ModalBody className="modal-body-md">
                <div className="sp-package text-center">
                    <div className="sp-package-head">
                        <h4 className="title">Change Subscription</h4>
                        <p className="text-soft">This change will become effective on Jan 14, 2020 on your account.</p>
                    </div>

                    <ul className="sp-package-plan nav nav-switch nav-tabs">
                        <li className="nav-item">
                            <a href="#" className="nav-link active">Yearly</a>
                        </li>
                        <li className="nav-item">
                            <a href="#" className="nav-link">Monthly</a>
                        </li>
                    </ul>

                    <ul className="sp-package-list">
                        <li className="sp-package-item">
                            <input className="sp-package-choose" type="radio" name="subscription-pack-plan" id="pack-plan-entprise" defaultChecked/>
                            <label className="sp-package-desc" htmlFor="pack-plan-entprise">
                                <span className="sp-package-info">
                                    <span className="sp-package-title title">Enterprise Plan <span className="badge bg-primary rounded-pill">Current</span></span>
                                    <span className="sp-package-detail">Unlimited Access / $599.00 USD / Year</span>
                                </span>
                                <span className="sp-package-price">
                                    <span className="sp-package-amount yearly"> 
                                        <span className="amount">$599.00</span>
                                        <span className="text-soft">Yearly</span>
                                    </span>
                                    <span className="sp-package-amount monthly d-none"> 
                                        <span className="amount">$99.00</span>
                                        <span className="text-soft">Monthly</span>
                                    </span>
                                </span>
                            </label>
                        </li>
                        <li className="sp-package-item">
                            <input className="sp-package-choose" type="radio" name="subscription-pack-plan" id="pack-plan-pro"/>
                            <label className="sp-package-desc" htmlFor="pack-plan-pro">
                                <span className="sp-package-info">
                                    <span className="sp-package-title title">NioPro Plan</span>
                                    <span className="sp-package-detail">Unlimited Access / $249.00 USD / Year</span>
                                </span>
                                <span className="sp-package-price">
                                    <span className="sp-package-amount yearly"> 
                                        <span className="amount">$299.00</span>
                                        <span className="text-soft">Yearly</span>
                                    </span>
                                    <span className="sp-package-amount monthly d-none"> 
                                        <span className="amount">$49.00</span>
                                        <span className="text-soft">Monthly</span>
                                    </span>
                                </span>
                            </label>
                        </li>
                        <li className="sp-package-item">
                            <input className="sp-package-choose" type="radio" name="subscription-pack-plan" id="pack-plan-free" />
                            <label className="sp-package-desc" htmlFor="pack-plan-free">
                                <span className="sp-package-info">
                                    <span className="sp-package-title title">Free Plan</span>
                                    <span className="sp-package-detail">Free Access / $0.00 USD / Year</span>
                                </span>
                                <span className="sp-package-price">
                                    <span className="sp-package-amount yearly"> 
                                        <span className="amount">$0.00</span>
                                        <span className="text-soft">Yearly</span>
                                    </span>
                                    <span className="sp-package-amount monthly d-none"> 
                                        <span className="amount">$0.00</span>
                                        <span className="text-soft">Monthly</span>
                                    </span>
                                </span>
                            </label>
                        </li>
                    </ul>
                    <div className="sp-package-action">
                        <a className="btn btn-primary"  
                            onClick={(ev) => {
                                ev.preventDefault();
                                setSubscriptionChangeModal(false);
                                setSubscriptionConfirmedModal(true);
                            }} 
                            href="#subscription-confirmed"
                        >Change Plan</a>
                        <a className="btn btn-dim btn-danger" 
                            onClick={(ev) => {
                                ev.preventDefault();
                                setSubscriptionChangeModal(false)
                                setSubscriptionCancelModal(true);
                            }} 
                            href="#subscription-cancel"
                        >Cancel Plan</a>
                    </div>
                </div>
            </ModalBody>
        </Modal>

        <Modal isOpen={subscriptionConfirmedModal} size="md" toggle={() => setSubscriptionConfirmedModal(false)}>
            <ModalBody className="modal-body-md text-center">

                <div className="nk-modal">
                    <em className="nk-modal-icon icon icon-circle icon-circle-xxl ni ni-check bg-success"></em>
                    <h4 className="nk-modal-title">Plan Change Successfully!</h4>
                    <div className="nk-modal-text">
                        <p>It will effect at the end of your current billing cycle on <strong>01 Feb 2020</strong>. We sent you a confirmation email <strong>(this may take up to 3 hours to receive)</strong>.</p>
                        <p className="sub-text-sm"><a href="#">Click here</a> to learn more about subscription plan.</p>
                    </div>
                    <div className="nk-modal-action-lg">
                        <a href="#" className="btn btn-mw btn-light" 
                        onClick={(ev) => {
                            ev.preventDefault();
                            setSubscriptionConfirmedModal(false);
                        }} 
                        >Return</a>
                    </div>
                </div>

            </ModalBody>
            <div className="modal-footer bg-lighter">
                <div className="text-center w-100">
                    <p>Earn upto $25 for each friend your refer! <a href="#">Invite friends</a></p>
                </div>
            </div>
        </Modal>

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
    </React.Fragment>
  );
};

export default Subscriptions;
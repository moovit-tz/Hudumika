import React, { useState } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, RSelect } from "@/components/Component";
import { Link } from "react-router-dom";
import DatePicker from "react-datepicker";

import LogoDark2x from '@/images/logo-dark2x.png';
import LogoLight2x from '@/images/logo2x.png';

import visa from "@/images/copywriter/icons/card/visa.png";
import mastercard from "@/images/copywriter/icons/card/mastercard.png";
import amex from "@/images/copywriter/icons/card/amex.png";
import diners from "@/images/copywriter/icons/card/diners.png";

const country = [
    {
      id: 1,
      value: "AE",
      label: "United Arab Emirates",
    },
    {
      id: 2,
      value: "GB",
      label: "United Kingdom",
    },
    {
      id: 3,
      value: "US",
      label: "United States",
    },
    {
      id: 4,
      value: "SE",
      label: "Sweden",
    },
    {
      id: 5,
      value: "CH",
      label: "Switzerland",
    },
]

const Payment = () => {
    const [expDate, setExpDate] = useState();
  return (
    <React.Fragment>
      <Head title="Payment"></Head>
        <div className="nk-split nk-split-page nk-split-lg">
            <div className="nk-split-content bg-lighter w-50 d-flex align-items-center justify-content-center justify-content-lg-end p-4 p-sm-5">
                <div className="wide-xs w-100">
                    <div className="d-flex">
                      <Link className="pe-2 d-flex align-items-center" to={`/copywriter`}>
                            <em className="icon ni ni-arrow-left text-base"></em>
                            <div className="logo-link ms-3">
                                <img className="logo-light logo-img" src={LogoLight2x} alt="logo" />
                                <img className="logo-dark logo-img" src={LogoDark2x} alt="logo" />
                            </div>
                      </Link>
                    </div>
                    <div className="pt-4">
                        <div className="fs-4 fw-normal mb-1">Subscribe to Unlimited (Yearly)</div>
                        <h3 className="display-4 fw-semibold">$225 <span className="caption-text text-base fw-normal"> per year</span></h3>
                        <div className="fs-5 fw-normal mt-2">A yearly pro plan for dashlite</div>
                    </div>
                    <ul className="mt-4 gy-4 pb-2">
                        <li className="d-flex justify-content-between">
                            <div className="">
                                <div className="caption-text">Unlimited (Yearly)</div>
                                <span className="sub-text">Qty 1Billed yearly</span>
                            </div>
                            <div className="caption-text">$225.00</div>
                        </li>
                        <li className="d-flex justify-content-between">
                            <div className="">
                                <div className="caption-text">Subtotal</div>
                            </div>
                            <div className="caption-text">$225.00</div>
                        </li>
                    </ul>
                    <div className="border-top border-bottom py-3">
                        <button className="btn btn-white btn-outline-light btn-md">
                            Add promotion code
                        </button>
                    </div>
                    <div className="d-flex justify-content-between pt-2 pb-lg-5 mb-lg-5">
                        <div className="caption-text">Total</div>
                        <div className="caption-text">$225.00</div>
                    </div>
                    <div className="d-flex flex-wrap align-items-center justify-content-between mt-5 pt-lg-5">
                        <div className="text-base fs-14px">Powered By Stripe</div>
                        <ul className="nav nav-sm mx-n1">
                            <li className="nav-item"><a className="nav-link px-1" href="#">Terms</a></li>
                            <li className="nav-item"><a className="nav-link px-1" href="#">Privacy</a></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="nk-split-content bg-white w-50 d-flex align-items-center justify-content-center justify-content-lg-start p-4 p-sm-5">
                <div className="wide-xs w-100">
                    <h3 className="mb-3">Pay with card</h3>
                    <Row className="g-3">
                        <Col size="12">
                            <div className="form-group">
                                <label className="form-label" htmlFor="email">Email</label>
                                <div className="form-control-wrap">
                                    <input className="form-control" type="email" id="email" placeholder="Enter email address"/>
                                </div>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="form-group">
                                <label className="form-label" htmlFor="card-number">Card information</label>
                                <div className="form-control-wrap">
                                    <div className="d-flex flex-wrap border border-light rounded-4">
                                        <div className="w-100 border-bottom border-light d-flex align-items-center">
                                            <input className="form-control-plaintext px-3" type="number" id="card-number" placeholder="1234 1234 1234 1234"/>
                                            <ul className="d-flex pe-3 gx-1 flex-shrink-0">
                                                <li className="h-1rem d-inline-flex">
                                                    <img src={visa} alt="" className="h-100" />
                                                </li>
                                                <li className="h-1rem d-inline-flex">
                                                    <img src={mastercard} alt="" className="h-100" />
                                                </li>
                                                <li className="h-1rem d-inline-flex">
                                                    <img src={amex} alt="" className="h-100" />
                                                </li>
                                                <li className="h-1rem d-inline-flex">
                                                    <img src={diners} alt="" className="h-100" />
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="w-50 border-end border-light">
                                            <DatePicker className="form-control-plaintext px-3 date-picker-ym" 
                                                dateFormat="MM/yy" 
                                                selected={expDate}
                                                showMonthYearPicker
                                                onChange={(date) => setExpDate(date)} placeholderText="MM/YY" 
                                            />
                                        </div>
                                        <div className="w-50">
                                            <input className="form-control-plaintext px-3" type="number" id="card-ccv" placeholder="123"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="form-group">
                                <label className="form-label" htmlFor="name">Name on card</label>
                                <div className="form-control-wrap">
                                    <input className="form-control" type="text" id="name" placeholder="Full Name"/>
                                </div>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="form-group">
                                <label className="form-label">Country</label>
                                <div className="form-control-wrap">
                                    <RSelect
                                        options={country}
                                        defaultValue={country[0]}
                                    />
                                </div>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="p-2 border border-light rounded-2 my-1">
                                <div className="form-check flex-nowrap">  
                                    <input className="form-check-input mt-0 flex-shrink-0" type="checkbox" value="" id="savecard" />  
                                    <label className="form-check-label" htmlFor="savecard">
                                        <h6 className="mb-1">Securely save my information for 1-click checkout</h6>
                                        <p className="fs-12px lh-sm">Pay faster on Genious.AI and everywhere Link is accepted.</p>
                                    </label>
                                </div>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="form-group">
                                <button className="btn btn-primary btn-block">Subscribe</button>
                            </div>
                        </Col>
                        <Col size="12">
                            <div className="form-note">
                                By confirming your subscription, you allow Genious.AI to charge your card for this payment and future payments in accordance with their terms. You can always cancel your subscription.
                            </div>
                        </Col>
                    </Row>
                </div>
            </div>
        </div>
    </React.Fragment>
  );
};

export default Payment;

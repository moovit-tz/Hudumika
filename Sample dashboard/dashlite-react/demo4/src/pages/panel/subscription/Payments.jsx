import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Col, Icon, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, Badge } from "reactstrap";
import paymentData from "./data/payments";

const payments = paymentData.slice(0,10);

const Payments = () => {
  return (
    <React.Fragment>
      <Head title="Payment History"></Head>
      <Content>
        <BlockHead size="lg">
            <div className="nk-block-head-sub"><span>Account Billing</span></div>
            <BlockBetween size="md" className="g-4">
                <BlockHeadContent>
                  <BlockTitle tag="h2" className="fw-normal">Payment History</BlockTitle>
                  <BlockDes>
                    <p>Here is your payment history of account.</p>
                  </BlockDes>
                </BlockHeadContent>
                <BlockHeadContent>
                    <ul className="nk-block-tools gx-3">
                        <li className="order-md-last">
                            <Link to={`/subscription/invoices`} className="btn btn-white btn-dim btn-outline-primary">
                              <Icon name="reports" /><span><span className="d-none d-sm-inline-block">Get</span> Invoice</span>
                            </Link>
                        </li>
                    </ul>
                </BlockHeadContent>
            </BlockBetween>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
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
      </Content>
    </React.Fragment>
  );
};

export default Payments;
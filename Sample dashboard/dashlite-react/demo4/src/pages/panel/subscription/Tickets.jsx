import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockDes, BlockHead, BlockHeadContent, BlockTitle, Col, Icon, Row, TooltipComponent } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card } from "reactstrap";
import classNames from "classnames";

import ticketData from "./data/tickets";

const Tickets = () => {
  return (
    <React.Fragment>
      <Head title="Tickets"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span>My Tickets</span></div>
          <BlockBetween size="md" className="g-4">
              <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Support Ticket</BlockTitle>
              <BlockDes>
                  <p>Here are all of your support request that you already sent.</p>
              </BlockDes>
              </BlockHeadContent>
              <BlockHeadContent>
                  <ul className="nk-block-tools g-4">
                      <li className="order-md-last">
                        <a href="#" className="btn btn-white btn-dim btn-outline-primary"><span>Submit Ticket</span></a>
                      </li>
                  </ul>
              </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
            <table className="table table-tickets">
                <thead className="tb-ticket-head">
                    <tr className="tb-ticket-title">
                        <th className="tb-ticket-id"><span>Ticket</span></th>
                        <th className="tb-ticket-desc">
                            <span>Subject</span>
                        </th>
                        <th className="tb-ticket-date tb-col-md">
                            <span>Submitted</span>
                        </th>
                        <th className="tb-ticket-seen tb-col-md">
                            <span>Last Seen</span>
                        </th>
                        <th className="tb-ticket-status">
                            <span>Status</span>
                        </th>
                        <th className="tb-ticket-action">
                            &nbsp;
                        </th>
                    </tr>
                </thead>
                <tbody className="tb-ticket-body">
                  {ticketData.map((item,index)=> {
                    const avatarClass = classNames({
                        ["icon-avatar"]:true,
                        "bg-danger-dim":item.lastreply.by === 'Support Team',
                        "bg-primary-dim":item.lastreply.by === 'You',
                        "bg-warning-dim":item.lastreply.by === 'Technical Team',
                    })
                    const statusBadgeClass = classNames({
                        ["badge"]:true,
                        "bg-success":item.status === 'Open',
                        "bg-light":item.status === 'Close',
                    })
                    return(
                      <tr key={index} className={`tb-ticket-item${item.unread && ' is-unread'}`}>
                        <td className="tb-ticket-id"><Link to={`/subscription/ticket-details/${item.id}`}>{item.id}</Link></td>
                        <td className="tb-ticket-desc">
                            <Link to={`/subscription/ticket-details/${item.id}`}><span className="title">{item.subject}</span></Link>
                        </td>
                        <td className="tb-ticket-date tb-col-md">
                            <span className="date">{item.submitted}</span>
                        </td>
                        <td className="tb-ticket-seen tb-col-md">
                            <span className="date d-flex text-nowrap">
                              <TooltipComponent icon="user-fill" iconClass={avatarClass} id={item.id} text={item.lastreply.by} />
                              {item.lastreply.date} <span className="d-none d-xl-inline">{item.lastreply.time}</span>
                            </span>
                        </td>
                        <td className="tb-ticket-status">
                            <span className={statusBadgeClass}>{item.status}</span>
                        </td>
                        <td className="tb-ticket-action">
                            <Link to={`/subscription/ticket-details/${item.id}`} className="btn btn-icon btn-trigger">
                                <Icon name="chevron-right" />
                            </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>    
          </Card>
        </Block>
        <Block size="lg">
          <Card className="card-bordered border-primary">
            <div className="card-inner">
                <div className="nk-cta">
                    <div className="nk-cta-block">
                        <div className="nk-cta-img">
                            <Icon className="icon-circle" name="msg" />
                        </div>
                        <div className="nk-cta-text">
                            <p>If you don’t find your question please contact our support team.</p>
                        </div>
                    </div>
                    <div className="nk-cta-action">
                        <Link to={`/subscription/contact`} className="btn btn-primary">Contact Us</Link>
                    </div>
                </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Tickets;
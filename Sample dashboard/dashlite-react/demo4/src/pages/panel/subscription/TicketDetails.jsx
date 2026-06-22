import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, Col, Row, Icon, TooltipComponent } from "@/components/Component";
import { Link, useParams } from "react-router-dom";
import ticketData from "./data/tickets";
import { Badge, Button, Card } from "reactstrap";

import attachmentA from "@/images/gfx/attach-a.jpg";
import attachmentB from "@/images/gfx/attach-b.jpg";

const TicketDetails = () => {
  const [data] = useState(ticketData);
  const [ticket, setTicket] = useState();

  let { ticketId } = useParams();

  useEffect(() => {
    const id = ticketId;
    if (id !== undefined || null || "") {
      let sTicket = data.find((item) => item.id === id);
      setTicket(sTicket);
    } else {
      setTicket(data[0]);
    }
  }, [ticketId, data]);

  return (
    <React.Fragment>
      <Head title="Ticket Details"></Head>
      {ticket && (<Content>
        <BlockHead>
          <div className="nk-block-head-sub"><Link className="back-to" to={`/subscription/tickets`}><Icon name="arrow-left"/><span>My Tickets</span></Link></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">{ticket.subject}</BlockTitle>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <div className="ticket-info">
              <ul className="ticket-meta">
                  <li className="ticket-id"><span>Ticket ID:</span> <strong>{ticket.id}</strong></li>
                  <li className="ticket-date"><span>Submitted:</span> <strong>{ticket.submitted}</strong></li>
              </ul>
              <div className="ticket-status">
                <Badge className={`${ticket.status === 'Open' ? " bg-success" : ''}${ticket.status === 'Close' ? " bg-light" : ''}`}>{ticket.status}</Badge>
              </div>
          </div>
        </Block>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="ticket-msgs">
                <div className="ticket-msg-item">
                    <div className="ticket-msg-from">
                        <div className="ticket-msg-user user-card">
                            <div className="user-avatar bg-primary">
                                <span>KA</span>
                            </div>
                            <div className="user-info">
                                <span className="lead-text">Kenneth Anderson</span>
                                <span className="text-soft">Customer</span>
                            </div>
                        </div>
                        <div className="ticket-msg-date">
                            <span className="sub-text">Jan 26, 2020 6:00 AM</span>
                        </div>
                    </div>
                    <div className="ticket-msg-comment">
                        <p><strong>Hello Sir,</strong></p>
                        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                        <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
                        <p>Best Regerds<br/><strong>Kenneth Anderson</strong></p>
                    </div>
                </div>

                <div className="ticket-msg-item is-mine">
                    <div className="ticket-msg-from">
                        <div className="ticket-msg-user user-card">
                            <div className="user-avatar bg-warning">
                                <span>AB</span>
                            </div>
                            <div className="user-info">
                                <span className="lead-text">Abu Bin Ishtiyak</span>
                                <span className="text-soft">Support Team</span>
                            </div>
                        </div>
                        <div className="ticket-msg-date">
                            <span className="sub-text">Just Now</span>
                        </div>
                    </div>
                    <div className="ticket-msg-comment">
                        <p><strong>Hello Kenneth,</strong></p>
                        <p>Thanks for contact us with your issues. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                        <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
                    </div>
                    <div className="ticket-msg-attach">
                        <h6 className="title">Attachment</h6>
                        <ul className="ticket-msg-attach-list">
                            <li>
                                <a href="#">
                                    <img src={attachmentA} alt="" />
                                    <Icon name="download"></Icon>
                                </a>
                            </li>
                            <li>
                                <a href="#">
                                    <img src={attachmentB} alt="" />
                                    <Icon name="download"></Icon>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="ticket-msg-reply">
                    <h5 className="title">Reply</h5> 
                    <form action="#" className="form-reply">
                        <div className="form-group">
                            <div className="form-editor-custom">
                                <textarea className="form-control" placeholder="Write a message..."></textarea>
                                <div className="form-editor-action">
                                    <ul className="form-editor-btn-group">
                                        <li className="form-btn-more">
                                          <TooltipComponent tag="a" text="Add File" icon="clip-h" containerClassName="btn btn-icon" id="add-file" />
                                        </li>
                                        <li className="form-btn-more">
                                          <TooltipComponent tag="a" text="Add Image" icon="img" containerClassName="btn btn-icon" id="add-image" />
                                        </li>
                                        <li className="form-btn-more">
                                          <TooltipComponent tag="a" text="Add Link" icon="link" containerClassName="btn btn-icon" id="add-link" />
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="form-action">
                            <ul className="form-btn-group">
                                <li className="form-btn-primary"><Button color="primary">Send</Button></li>
                                <li className="form-btn-secondary"><Button color="outline-light" className="btn-dim">Mark as close</Button></li>
                            </ul>
                        </div>
                    </form>
                </div>
              </div>
            </div>
          </Card>
        </Block>
      </Content>)}
    </React.Fragment>
  );
};

export default TicketDetails;

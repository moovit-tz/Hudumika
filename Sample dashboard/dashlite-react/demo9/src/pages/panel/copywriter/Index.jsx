import React from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon, UserAvatar } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, DropdownMenu,
  DropdownToggle,
  UncontrolledDropdown,
  DropdownItem, Badge } from "reactstrap";
import { templates } from "./data/templates";
import { documents } from "./data/document";
import classnames from "classnames";

const statusCard = [
  {
    title: "Words Available",
    theme:"primary",
    link: {
      text: "See History",
      to:"history"
    },
    amount:"452",
    amountText:"Words",
    total:"2000",
    note: "free words generated"
  },
  {
    title: "Drafts Available",
    theme:"warning",
    link: {
      text: "See All",
      to:"document-drafts"
    },
    amount:"3",
    amountText:"Drafts",
    total:"10",
    note: "free drafts created"
  },
  {
    title: "Documents Available",
    theme:"info",
    link: {
      text: "See All",
      to:"document-saved"
    },
    amount:"6",
    amountText:"Documents",
    total:"10",
    note: "free documents created"
  },
  {
    title: "Tools Available",
    theme:"danger",
    link: {
      text: "All Tools",
      to:"templates"
    },
    amount:"12",
    amountText:"Tools",
    total:"16",
    note: "tools used to generate"
  },
]

const Dashboard = () => {
  return (
    <React.Fragment>
      <Head title="Dashboard"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="page-title">Welcome Back</BlockTitle>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            {statusCard.map((item,index) =>
              <Col key={index} xxl="3" sm="6">
                  <Card className={`card-full bg-${item.theme}`}>
                      <div className="card-inner">
                          <div className="d-flex align-items-center justify-content-between mb-1">
                              <div className="fs-6 text-white text-opacity-75 mb-0">{item.title}</div>
                              {item.link && <Link to={`/copywriter/${item.link.to}`} className="link link-white">{item.link.text}</Link>}
                          </div>
                          <h5 className="fs-1 text-white">{item.amount} <small className="fs-3">{item.amountText}</small></h5>
                          <div className="fs-7 text-white text-opacity-75 mt-1">
                            <span className="text-white">{item.total - item.amount}</span>/{item.total} {item.note}
                          </div>
                      </div>
                  </Card>
              </Col>
            )}
          </Row>
        </Block>
        <BlockHead>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h4">Popular Templates</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to={`/copywriter/templates`} className="link">Explore All</Link>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            {templates.filter((item)=> item.popular).slice(0,4).map((item,index)=>
              <Col key={index} xxl="3" sm="6">
                  <Card className="card-full">
                    <div className="card-inner">
                      {item.badge && <div className="d-inline-flex position-absolute end-0 top-0 me-4 mt-4">
                          <div className={classnames([
                            {"badge border-0 rounded-pill text-uppercase": true},
                            { "text-bg-light": item.badge === "New" },
                            { "text-white bg-pink": item.badge === "Popular" },
                          ])}
                          >{item.badge}</div>
                      </div>}
                      <UserAvatar className={`text-${item.theme} bg-${item.theme}-dim mb-3`} icon={item.icon}></UserAvatar>
                      <h5 className="title">{item.title}</h5>
                      <p className="sub-text">{item.excerpt}</p>
                    </div>
                  </Card>
              </Col>
            )}
          </Row>
        </Block>
        <BlockHead>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h4">Recent Documents</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to={`/copywriter/document-saved`} className="link"><span>See All</span> <Icon name="chevron-right" /></Link>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Card>
            <table className="table">
              <thead>
                  <tr className="nk-tb-item nk-tb-head">
                      <th className="nk-tb-col nk-tb-col-check">
                          <div className="custom-control custom-control-sm custom-checkbox notext">
                              <input type="checkbox" className="custom-control-input" id="did-all" />
                              <label className="custom-control-label" htmlFor="did-all"></label>
                          </div>
                      </th>
                      <th className="nk-tb-col">
                          <h6 className="overline-title">Name</h6>
                      </th>
                      <th className="nk-tb-col tb-col-sm">
                          <h6 className="overline-title">Type</h6>
                      </th>
                      <th className="nk-tb-col tb-col-md">
                          <h6 className="overline-title">Last Modified</h6>
                      </th>
                      <th className="nk-tb-col"></th>
                  </tr>
              </thead>
              <tbody>
                {documents.slice(0,4).map((item,index)=>
                  <tr key={item.id} className="nk-tb-item">
                    <td className="nk-tb-col nk-tb-col-check">
                        <div className="custom-control custom-control-sm custom-checkbox notext">
                            <input type="checkbox" className="custom-control-input" id={item.id} />
                            <label className="custom-control-label" htmlFor={item.id}></label>
                        </div>
                    </td>
                    <td className="nk-tb-col">
                      <div className="caption-text">{item.name}</div>
                    </td>
                    <td className="nk-tb-col tb-col-sm">
                      <Badge color={item.tagcolor} className="badge-dim rounded-pill">{item.type}</Badge>
                    </td>
                    <td className="nk-tb-col tb-col-md">
                      <div className="sub-text d-inline-flex flex-wrap gx-2">{item.lastmodified}</div>
                    </td>
                    <td className="nk-tb-col tb-col-end">
                      <UncontrolledDropdown>
                        <DropdownToggle tag="a" className="dropdown-toggle btn btn-icon btn-trigger">
                          <Icon name="more-h"></Icon>
                        </DropdownToggle>
                        <DropdownMenu end>
                          <ul className="link-list-opt no-bdr">
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#eye"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                }}
                              >
                                <Icon name="eye"></Icon>
                                <span>View Document</span>
                              </DropdownItem>
                            </li>
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#edit"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                }}
                              >
                                <Icon name="edit"></Icon>
                                <span>Rename</span>
                              </DropdownItem>
                            </li>
                            <li>
                              <DropdownItem
                                tag="a"
                                href="#trash"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                }}
                              >
                                <Icon name="trash"></Icon>
                                <span>Move to Trash</span>
                              </DropdownItem>
                            </li>
                          </ul>
                        </DropdownMenu>
                      </UncontrolledDropdown>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Dashboard;

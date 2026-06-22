import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon, Button, UserAvatar } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, Badge } from "reactstrap";
import { templates, category } from "./data/templates";
import classnames from "classnames";

const Templates = () => {
  const [sm, updateSm] = useState(false);
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(templates);
  const [filtered, setFiltered] = useState(templates);
  const [selectedCategory, setSelectedCategory] = useState("*");

  useEffect(() => {
    if (selectedCategory === "*") {
      setFiltered(templates);
    }else {
      const filteredObject = templates.filter((item) => {
        return (
          item.category.toLowerCase().includes(selectedCategory.toLowerCase())
        );
      });
      setFiltered([...filteredObject]);
    }
  }, [selectedCategory])
  
  useEffect(() => {
    if (search !== "") {
      const searchedObject = filtered.filter((item) => {
        return (
          item.title.toLowerCase().includes(search.toLowerCase())
        );
      });
      setData([...searchedObject]);
    }else {
      setData(filtered);
    }
  }, [search,filtered])

  return (
    <React.Fragment>
      <Head title="Templates"></Head>
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-head-sub"><span></span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle className="page-title">Template Library</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="toggle-wrap nk-block-tools-toggle">
                <Button
                  className={`btn-icon btn-trigger toggle-expand me-n1 ${sm ? "active" : ""}`}
                  onClick={() => updateSm(!sm)}
                >
                  <Icon name="more-v"></Icon>
                </Button>
                <div className="toggle-expand-content" style={{ display: sm ? "block" : "none" }}>
                      <ul className="nk-block-tools g-3">
                          <li>
                              <Button size="md" color={view === "list" ? "primary" : "outline-light"} className="btn-icon btn-dim" onClick={()=> setView("list")}><Icon name="view-list-wd"></Icon></Button>
                          </li>
                          <li>
                              <Button size="md" color={view === "grid" ? "primary" : "outline-light"} className="btn-icon btn-dim" onClick={()=> setView("grid")}><Icon name="grid-fill"></Icon></Button>
                          </li>
                          <li className="nk-block-tools-opt">
                              <div className="form-control-wrap">
                                  <div className="form-icon form-icon-right">
                                      <Icon name="search"></Icon>
                                  </div>
                                  <input type="text" className="form-control" placeholder="Search Template" 
                                  onChange={(e) => {
                                    setSearch(e.target.value);
                                  }}/>
                              </div>
                          </li>
                      </ul>
                  </div>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <ul className="filter-button-group mb-4 pb-1">
              {category.map((item,index)=>
                <li key={index}>
                  <button 
                    className={`filter-button ${selectedCategory === item.name && "active"}`} 
                    onClick={()=> setSelectedCategory(item.name)} 
                    type="button"
                  > {item.text} </button>
                </li>
              )}
          </ul>
          <Row className={view === "grid" ? "g-gs" : "g-3"}>
            {view === "grid" && data.map((item,index)=>
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
            {view === "list" && data.map((item,index)=>
              <Col key={index} size="12">
                <Card>
                  <div className="card-inner">
                    <div className="d-flex position-relative">
                        {item.badge && <div className="d-inline-flex position-absolute end-0 top-0">
                            <div className={classnames([
                              {"badge border-0 rounded-pill text-uppercase": true},
                              { "text-bg-light": item.badge === "New" },
                              { "text-white bg-pink": item.badge === "Popular" },
                            ])}
                            >{item.badge}</div>
                        </div>}
                        <UserAvatar className={`text-${item.theme} bg-${item.theme}-dim mb-3`} icon={item.icon}></UserAvatar>
                        <div className="ms-4 flex-grow-1">
                          <h5 className="title">{item.title}</h5>
                          <p className="sub-text">{item.excerpt}</p>
                        </div>
                    </div>
                  </div>
                </Card>
              </Col>
            )}
          </Row>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Templates;

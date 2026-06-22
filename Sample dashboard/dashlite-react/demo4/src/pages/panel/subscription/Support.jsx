import React,{useState,useEffect} from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Icon, Col, Row } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card } from "reactstrap";
import {supportTopics, supportQuestions} from "./data/support";
const Support = () => {
  const [search, setSearch] = useState("");
  const [questions, setQuestions] = useState(supportQuestions);
  useEffect(() => {
    if (search !== "") {
      const filteredObject = supportQuestions.filter((item) => {
        return (
          item.title.toLowerCase().includes(search.toLowerCase())
        );
      });
      setQuestions([...filteredObject]);
    }
  }, [search])
  
  return (
    <React.Fragment>
      <Head title="Support"></Head>
      <Content>
        <BlockHead size="md">
          <div className="nk-block-head-sub"><span>Supports</span></div>
          <BlockHeadContent>
            <BlockTitle tag="h2" className="fw-normal">Hi! How can we help?</BlockTitle>
            <BlockDes>
              <p>If you have any problem have a look in our knowledge base support.</p>
            </BlockDes>
            <div className="nk-search-box">
              <div className="form-group">
                  <div className="form-control-wrap">
                      <input
                        onChange={(e) => {
                          setSearch(e.target.value);
                        }}
                      type="text" className="form-control form-control-lg" placeholder="Search..." />
                      <span className="form-icon form-icon-right">
                          <Icon name="search" />
                      </span>
                  </div>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          {(search === "") ? supportTopics.map((item,index) =>{
            let count = supportQuestions.filter((q) => q.topic === item.id);
            return(
              <div key={index} className="support-topic-item card card-bordered">
                <Link className="support-topic-block card-inner" to={count.length ? `/subscription/support/${item.slug}` : `/subscription/contact`}>
                    <div className="support-topic-media">
                        {item.icon}
                    </div>
                    <div className="support-topic-context">
                        <h5 className="support-topic-title title">{item.title}</h5>
                        <div className="support-topic-info">{item.desc}</div>
                        {count.length ? <div className="support-topic-count">Here are {count.length} questions and answers.</div> : <div className="sub-text small mt-1">Nothing here, ask your questions .</div>}
                    </div>
                    <div className="support-topic-action">
                        <em className="icon ni ni-chevron-right"></em>
                    </div>
                </Link>
              </div>
            )
          }): 
            <Card className="card-bordered">
              <div className="card-inner">
                {(questions.length > 0) ? questions.map((item,index)=> 
                  <div className="support-queue-item" key={index}>
                      <Link className="support-queue-link" to={`/subscription/support/general-topics/${item.id}`}>
                          <div className="support-queue-media">
                              <Icon name={item.icon} className={`icon-circle ${item.iconTheme ? item.iconTheme : ''}`}></Icon>
                          </div>
                          <div className="support-queue-body">
                              <div className="support-queue-context">
                                  <h5 className="support-queue-title title">{item.title}</h5>
                                  <div className="support-queue-desc">{item.excerpt}</div>
                              </div>
                              <div className="support-queue-update">
                                  <span>{item.updated}</span>
                              </div>
                          </div>
                      </Link>
                  </div>
                ) : "Noting found with your query"}
              </div>
            </Card>
          }
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

export default Support;

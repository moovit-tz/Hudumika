import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Icon } from "@/components/Component";
import { Link, useParams } from "react-router-dom";
import {supportTopics,supportQuestions} from "./data/support";
import { Card } from "reactstrap";

const SupportTopics = () => {
  const [data] = useState(supportTopics);
  const [topic, setTopic] = useState();

  let { topicSlug } = useParams();

  useEffect(() => {
    const slug = topicSlug;
    if (slug !== undefined || null || "") {
      let sTopic = data.find((item) => item.slug === slug);
      setTopic(sTopic);
    } else {
      setTopic(data[0]);
    }
  }, [topicSlug, data]);

  return (
    <React.Fragment>
      <Head title="Support Topics"></Head>
      {topic && (<Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><Link className="back-to" to={`/subscription/support`}><Icon name="arrow-left"/><span>Supports</span></Link></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">{topic.title}</BlockTitle>
              <BlockDes>
                <p>{topic.desc}</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              {supportQuestions.filter((item) => item.topic === topic.id).map((item,index)=> 
                <div className="support-queue-item" key={index}>
                    <Link className="support-queue-link" to={`/subscription/support/${topic.slug}/${item.id}`}>
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
              )}
            </div>
          </Card>
        </Block>
      </Content>)}
      
    </React.Fragment>
  );
};

export default SupportTopics;

import React, { useState, useEffect } from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon } from "@/components/Component";
import { Link, useParams } from "react-router-dom";
import {supportTopics,supportQuestions} from "./data/support";

import supportImage from "@/images/gfx/support.jpg";

const SupportTopicDetails = () => {
  const [data] = useState(supportQuestions);
  const [question, setQuestion] = useState();
  const [topic, setTopic] = useState();
  const [nextQuestion, setNextQuestion] = useState();
  const [nextTopic, setNextTopic] = useState();
  
  let { questionId, topicSlug } = useParams();

  useEffect(() => {
    const id = questionId;
    if (id !== undefined || null || "") {
      let sQuestion = data.find((item) => item.id === questionId);
      data.forEach((item,index) => {
        if(item.id === questionId && data.length > index){
          const itemtopic = data[index + 1] <= data.length ? supportTopics.find((topic) => topic.id === data[index + 1].topic) : supportTopics.find((topic) => topic.id === data[0].topic);
          setNextQuestion(data[index + 1]);
          setNextTopic(itemtopic);
        }
      })
      setQuestion(sQuestion);
      const itemtopic = supportTopics.find((topic) => topic.id === sQuestion.topic);
      setTopic(itemtopic);
    } else {
      setQuestion(data[0]);
    }
  }, [questionId, data]);
  return (
    <React.Fragment>
      <Head title="Support Topic Details"></Head>
      {question && (<Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub">
            <Link className="back-to" to={`/subscription/support/${topic.slug}`}>
              <Icon name="arrow-left"/><span>{question.topicTitle}</span>
            </Link>
          </div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">{question.title}</BlockTitle>
              <BlockDes>
                <p>{question.excerpt}</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <div className="support-topic-details card card-bordered">
            <div className="card-inner">
                <div className="entry">
                    <h3>Enable 2FA Authentication</h3>

                    <h5>What is two-factor authentication?</h5>
                    <p>Two-factor authentication is an extra layer of security that helps to protect your Envato account. When you have two-factor authentication on your account you will be asked to enter an authentication code in addition to your username and password when logging in.</p>

                    <h5>How it work</h5>
                    <p>Each time you log into your Dashlite account you will need to enter your username and password plus an authentication code. You will need to access your authentication code from a mobile app like Google Authenticator. These apps generate time-based codes that are only valid for a small period of time.</p>

                    <h5>Two-factor authentication enable processs</h5>
                    <p>Two-factor authentication enable process is given bellow:</p>
                    <img src={supportImage} alt="" />
                    <p>By the given step you can enable Two-factor authentication easily in your Dashlite account.</p>
                </div>
                <div className="support-topic-meta">
                    <div className="support-topic-author">
                        <ul className="author-list is-grouped">
                            <li className="updated"><span className="text-soft fs-12px">Last {question.updated}</span></li>
                            <li><span className="user-avatar bg-light text-dark">2</span></li>
                            <li><a href="#"><span className="user-avatar bg-primary">IH</span></a></li>
                            <li><a href="#"><span className="user-avatar bg-success">AB</span></a></li>
                        </ul>
                    </div>
                    <div className="support-topic-react">
                        <ul className="react-list">
                            <li className="title"><span>Was this page helpful?</span></li>
                            <li className="react-good"><a title="Good" href="#"><Icon name="happyf-fill"></Icon></a></li>
                            <li className="react-ok"><a title="Fair" href="#"><Icon name="meh-fill"></Icon></a></li>
                            <li className="react-bad"><a title="Bad" href="#"><Icon name="sad-fill"></Icon></a></li>
                        </ul>
                    </div>
                </div>
            </div>
          </div>
          {nextQuestion && 
            <div className="support-topic-more card card-bordered">
              <Link className="support-topic-block card-inner" to={`/subscription/support/${nextTopic.slug}/${nextQuestion.id}`}>
                  <div className="support-topic-context">
                      <div className="support-topic-title-sub">Next - {nextQuestion.topicTitle}</div>
                      <h5 className="support-topic-title title">{nextQuestion.title}</h5>
                  </div>
                  <div className="support-topic-action">
                      <Icon name="chevron-right"></Icon>
                  </div>
              </Link>
            </div>
          }
          
        </Block>
      </Content>)}
    </React.Fragment>
  );
};

export default SupportTopicDetails;

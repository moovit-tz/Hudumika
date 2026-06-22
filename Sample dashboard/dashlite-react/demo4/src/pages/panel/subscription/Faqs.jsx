import React, {useState} from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, Icon } from "@/components/Component";
import { Link } from "react-router-dom";
import { Card, Collapse } from "reactstrap";

const Faqs = () => {

  const [generalFaq, setGeneralFaq] = useState("1");
  const [accountFaq, setAccountFaq] = useState(null);

  return (
    <React.Fragment>
      <Head title="FAQs"></Head>
      <Content>
        <BlockHead size="lg">
          <div className="nk-block-head-sub"><span>FAQs</span></div>
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h2" className="fw-normal">Frequently Ask Questions</BlockTitle>
              <BlockDes>
                <p>Here are some question and you can find your answer.</p>
              </BlockDes>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block size="lg">
          <BlockHead size="sm">
            <h5 className="title text-primary">General Question</h5>
            <p>You can find general answer here.</p>
          </BlockHead>
          <div className="accordion">
            <div className="accordion-item">
              <a href="#"
                className= "accordion-head"
                onClick={(e) => { e.preventDefault(); setGeneralFaq("1")}}
              >
                <h6 className="title">What is Dashlite?</h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={generalFaq === "1" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
            <div className="accordion-item">
              <a href="#"
                className="accordion-head collapsed"
                onClick={(e) => { e.preventDefault(); setGeneralFaq("2")}}
              >
                <h6 className="title">
                  What are some of the benefits of receiving my bill electronically?
                </h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={generalFaq === "2" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
            <div className="accordion-item">
              <a href="#"
                className="accordion-head collapsed"
                onClick={(e) => { e.preventDefault(); setGeneralFaq("3")}}
              >
                <h6 className="title">
                  What is the relationship between Dashlite and payment?
                </h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={generalFaq === "3" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
            <div className="accordion-item">
              <a href="#"
                className="accordion-head collapsed"
                onClick={(e) => { e.preventDefault(); setGeneralFaq("4")}}
              >
                <h6 className="title">What are the benefits of using Dashlite?</h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={generalFaq === "4" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
          </div>
        </Block>

        <Block size="lg">
          <BlockHead size="sm">
            <h5 className="title text-primary">My Account</h5>
            <p>You can find answer here about your account</p>
          </BlockHead>
          <div className="accordion">
            <div className="accordion-item">
              <a href="#"
                className= "accordion-head"
                onClick={(e) => { e.preventDefault(); setAccountFaq("1")}}
              >
                <h6 className="title">How do I know my details are secure?</h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={accountFaq === "1" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
            <div className="accordion-item">
              <a href="#"
                className="accordion-head collapsed"
                onClick={(e) => { e.preventDefault(); setAccountFaq("2")}}
              >
                <h6 className="title">
                What can I do to protect my account account?
                </h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={accountFaq === "2" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
            <div className="accordion-item">
              <a href="#"
                className="accordion-head collapsed"
                onClick={(e) => { e.preventDefault(); setAccountFaq("3")}}
              >
                <h6 className="title">
                How can I delete my account?
                </h6>
                <span className="accordion-icon"></span>
              </a>
              <Collapse
                className="accordion-body"
                isOpen={accountFaq === "3" ? true : false}
              >
                <div className="accordion-inner">
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
                    reprehenderit in voluptate velit esse cillum dolore eu fugiat
                    nulla pariatur. Excepteur sint occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                  </p>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                    eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
                    enim ad minim veniam, quis nostrud exercitation ullamco laboris
                    nisi ut aliquip ex ea commodo consequat.
                  </p>
                </div>
              </Collapse>
            </div>
          </div>
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

export default Faqs;

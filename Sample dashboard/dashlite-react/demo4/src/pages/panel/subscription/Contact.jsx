import React, {useState} from "react";
import Content from "@/layout/content/Content";
import Head from "@/layout/head/Head";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, BlockDes, Col, Row, RSelect } from "@/components/Component";
import { Link } from "react-router-dom";
import { Button, Card, Collapse } from "reactstrap";
import Dropzone from "react-dropzone";

export const categoryOptions = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
];

export const priorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "high-priority", label: "High Priority" },
];

const Contact = () => {
  const [isOpenCollapse, setIsOpenCollapse] = useState(false);

  const toggleCollapse = () => setIsOpenCollapse(!isOpenCollapse);

  const [files, setFiles] = useState([]);
  const handleDropChange = (acceptedFiles, set) => {
    set(
      acceptedFiles.map((file) =>
        Object.assign(file, {
          preview: URL.createObjectURL(file),
        })
      )
    );
  };
  return (
    <React.Fragment>
      <Head title="Contact"></Head>
      <Content>
        <BlockHead size="lg" className="wide-sm m-auto text-center">
          <div className="nk-block-head-sub"><Link to={`/subscription/support`}>Contact</Link></div>
          <BlockHeadContent>
            <BlockTitle tag="h2" className="fw-normal">How can we help?</BlockTitle>
            <BlockDes>
              <p>You can find all of  the questions and answers abour secure your account</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <Block className="wide-sm m-auto">
          <Card className="card-bordered">
            <div className="card-inner">
                <form action="#" className="form-contact">
                    <div className="row g-4">
                        <div className="col-md-6">
                            <div className="custom-control custom-radio">
                                <input type="radio" className="custom-control-input" name="type" id="type-general" defaultChecked />
                                <label className="custom-control-label" htmlFor="type-general">A general enquiry</label>
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="custom-control custom-radio">
                                <input type="radio" className="custom-control-input" name="type" id="type-problem"/>
                                <label className="custom-control-label" htmlFor="type-problem">I have a problem need help</label>
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="form-group">
                                <label className="form-label"><span>Category</span></label>
                                <div className="form-control-wrap">
                                    <RSelect options={categoryOptions} />
                                </div>
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="form-group">
                                <label className="form-label"><span>Priority</span></label>
                                <div className="form-control-wrap">
                                  <RSelect options={priorityOptions} />
                                </div>
                            </div>
                        </div>
                        <div className="col-12">
                            <div className="form-group">
                                <label className="form-label">Describe the problem you have</label>
                                <div className="form-control-wrap">
                                    <input type="text" className="form-control form-control-lg" placeholder="Write your problem... " />
                                </div>
                            </div>
                        </div>
                        <div className="col-12">
                            <div className="form-group">
                                <label className="form-label"><span>Give us the details </span><em className="icon ni ni-info text-gray"></em></label>
                                <p className="text-soft">If you’re experiencing a personal crisis, are unable to cope and need support send message. We will always try to respond to texters as quickly as possible.</p>
                                <div className="form-control-wrap">
                                    <div className="form-editor-custom">
                                        <textarea className="form-control form-control-lg no-resize" placeholder="Write your message"></textarea>
                                        <div className="form-editor-action p-0">
                                            <a href="#" className={`link w-100 p-2 ${!isOpenCollapse ? 'collapsed': ''}`} onClick={(e)=> {e.preventDefault(); toggleCollapse()}}><em className="icon ni ni-clip"></em> Attach file</a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="col-12">
                            <Collapse className="choose-file" isOpen={isOpenCollapse}>
                              <div className="form-group" id="filedown">
                                  <div className="support-upload-box">
                                    <Dropzone onDrop={(acceptedFiles) => handleDropChange(acceptedFiles, setFiles)}>
                                      {({ getRootProps, getInputProps }) => (
                                        <section>
                                          <div {...getRootProps()} className="dropzone upload-zone dz-clickable">
                                            <input {...getInputProps()} />
                                            {files.length === 0 && (
                                              <div className="dz-message">
                                                <em className="icon ni ni-clip"></em>
                                                <span className="dz-message-text">Drag and drop file</span>
                                                <span className="dz-message-or">or</span>
                                                <Button color="primary">SELECT</Button>
                                              </div>
                                            )}
                                            {files.map((file) => (
                                              <div
                                                key={file.name}
                                                className="dz-preview dz-processing dz-image-preview dz-error dz-complete"
                                              >
                                                <div className="dz-image">
                                                  <img src={file.preview} alt="preview" />
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </section>
                                      )}
                                    </Dropzone>
                                  </div>
                              </div>
                            </Collapse>
                        </div>
                        <div className="col-12">
                            <Button color="primary">Email Us</Button>
                        </div>
                    </div>
                </form>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Contact;

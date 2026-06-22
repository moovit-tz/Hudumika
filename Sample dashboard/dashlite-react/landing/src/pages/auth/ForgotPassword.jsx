import React from "react";
import { useNavigate } from "react-router-dom";
import Logo from "@/images/logo.png";
import LogoDark from "@/images/logo-dark.png";
import PageContainer from "@/layout/page-container/PageContainer";
import Head from "@/layout/head/Head";
import AuthFooter from "./AuthFooter";
import {  Button } from "reactstrap";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const onFormSubmit = () => {
    navigate('/auth-success');
  };
  const {  handleSubmit } = useForm();
  return (
    <React.Fragment>
      <Head title="Forgot-Password" />
      <PageContainer>
        <div className="nk-block nk-block-middle nk-auth-body wide-xs">
          <div className="brand-logo pb-4 text-center">
            <Link to={"/"} className="logo-link">
              <img className="logo-light logo-img logo-img-lg" src={Logo} alt="logo" />
              <img className="logo-dark logo-img logo-img-lg" src={LogoDark} alt="logo-dark" />
            </Link>
          </div>
          <div className="card-preview card-bordered">
            <div className="card-inner card-inner-lg">
              <div className="nk-block-head">
                <div className="nk-block-content">
                  <h5 className="nk-block-title page">Reset Password</h5>
                  <div className="nk-block-des">
                    <p>If you forgot your password, well, then we’ll email you instructions to reset your password.</p>
                  </div >
                </div>
              </div>
              <form onSubmit={handleSubmit(onFormSubmit)}>
                <div className="form-group">
                  <div className="form-label-group">
                    <label className="form-label" htmlFor="default-01">
                      Email
                    </label>
                  </div>
                  <input
                    type="text"
                    className="form-control form-control-lg"
                    id="default-01"
                    placeholder="Enter your email address"
                  />
                </div>
                <div className="form-group">
                  <Button color="primary" size="lg" className="btn-block">
                    Send Reset Link
                  </Button>
                </div>
              </form>
              <div className="form-note-s2 text-center pt-4">
                <Link to={`/pages/auths/auth-login`}>
                  <strong>Return to login</strong>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <AuthFooter />
      </PageContainer>
    </React.Fragment>
  );
};
export default ForgotPassword;

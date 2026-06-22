import React, { useState } from "react";
import Logo from "@/images/logo.png";
import LogoDark from "@/images/logo-dark.png";
import PageContainer from "@/layout/page-container/PageContainer";
import Head from "@/layout/head/Head";
import AuthFooter from "./AuthFooter";
import { NioIcon } from "@/components/icon/Icon";
import { Spinner,  Button } from "reactstrap";
import { useForm } from "react-hook-form";
import { Link, useNavigate} from "react-router-dom";

const Register = () => {
  const [passState, setPassState] = useState(false);
  const [loading, setLoading] = useState(false);
  const {  register, handleSubmit, formState: { errors } } = useForm();
  const navigate = useNavigate();
  const handleFormSubmit = () => {
    setLoading(true);
    setTimeout(() => {
      navigate(`/pages/auths/auth-success`);
    }, 1000);
  };
  return (
    <React.Fragment>
      <Head title="Register" />
      <PageContainer>
        <div className="nk-block nk-block-middle nk-auth-body  wide-xs">
          <div className="brand-logo pb-4 text-center">
            <Link to="/" className="logo-link">
              <img className="logo-light logo-img logo-img-lg" src={Logo} alt="logo" />
              <img className="logo-dark logo-img logo-img-lg" src={LogoDark} alt="logo-dark" />
            </Link>
          </div>
          <div className="card-preview card-bordered">
            <div className="card-inner card-inner-lg">
                <div className="nk-block-head">
                  <div className="nk-block-content">
                    <h5 className="nk-block-title page">Register</h5>
                    <div className="nk-block-des">
                      <p>Create new dashlite account.</p>
                    </div >
                  </div>
                </div>
                <form className="is-alter" onSubmit={handleSubmit(handleFormSubmit)}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">
                      Name
                    </label>
                    <div className="form-control-wrap">
                      <input
                        type="text"
                        id="name"
                        {...register('name', { required: true })}
                        placeholder="Enter your name"
                        className="form-control-lg form-control" />
                      {errors.name && <p className="invalid">This field is required</p>}
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="form-label-group">
                      <label className="form-label" htmlFor="default-01">
                        Email or Username
                      </label>
                    </div>
                    <div className="form-control-wrap">
                      <input
                        type="text"
                        bssize="lg"
                        id="default-01"
                        {...register('email', { required: true })}
                        className="form-control-lg form-control"
                        placeholder="Enter your email address or username" />
                      {errors.email && <p className="invalid">This field is required</p>}
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="form-label-group">
                      <label className="form-label" htmlFor="password">
                        Passcode
                      </label>
                    </div>
                    <div className="form-control-wrap">
                      <a
                        href="#password"
                        onClick={(ev) => {
                          ev.preventDefault();
                          setPassState(!passState);
                        }}
                        className={`form-icon lg form-icon-right passcode-switch ${passState ? "is-hidden" : "is-shown"}`}
                      >
                        <NioIcon icon="eye" className="passcode-icon icon-show"></NioIcon>

                        <NioIcon icon="eye-off" className="passcode-icon icon-hide"></NioIcon>
                      </a>
                      <input
                        type={passState ? "text" : "password"}
                        id="password"
                        {...register('passcode', { required: "This field is required" })}
                        placeholder="Enter your passcode"
                        className={`form-control-lg form-control ${passState ? "is-hidden" : "is-shown"}`} />
                      {errors.passcode && <span className="invalid">{errors.passcode.message}</span>}
                    </div>
                  </div>
                  <div className="form-group">
                    <Button type="submit" color="primary" size="lg" className="btn-block">
                      {loading ? <Spinner size="sm" color="light" /> : "Register"}
                    </Button>
                  </div>
                </form>
                <div className="form-note-s2 text-center pt-4">
                  {" "}
                  Already have an account?{" "}
                  <Link to={`/pages/auths/auth-login`}>
                    <strong>Sign in instead</strong>
                  </Link>
                </div>
                <div className="text-center pt-4 pb-3">
                  <h6 className="overline-title overline-title-sap">
                    <span>OR</span>
                  </h6>
                </div>
                <ul className="nav justify-center gx-8">
                  <li className="nav-item">
                    <a
                      className="nav-link"
                      href="#socials"
                      onClick={(ev) => {
                        ev.preventDefault();
                      }}
                    >
                      Facebook
                    </a>
                  </li>
                  <li className="nav-item">
                    <a
                      className="nav-link"
                      href="#socials"
                      onClick={(ev) => {
                        ev.preventDefault();
                      }}
                    >
                      Google
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        <AuthFooter />
      </PageContainer>
    </React.Fragment>
  );
};
export default Register;

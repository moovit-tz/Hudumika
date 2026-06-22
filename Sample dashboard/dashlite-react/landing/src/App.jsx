import React, { Suspense, useEffect } from "react"
import {BrowserRouter, Routes, Route} from 'react-router-dom'
import IndexOne from "./pages/IndexOne"
import IndexTwo from "./pages/IndexTwo"
import IndexThree from "./pages/IndexThree"
import IndexFour from "./pages/IndexFour"
import IndexFive from "./pages/IndexFive"
import IndexSix from "./pages/IndexSix"
import Error404Classic from "./pages/error/404-classic"
import Error404Modern from "./pages/error/404-modern"
import Error504Classic from "./pages/error/504-classic"
import Error504Modern from "./pages/error/504-modern"
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword"
import Success from "./pages/auth/Success";

function App() {
  useEffect(() => {
    document.body.className = "nk-body bg-white npc-landing no-touch nk-nio-theme";
  }, []);

  return (
    <Suspense fallback={<div/>}>
      <div className="nk-app-root">
        <BrowserRouter>
          <Routes>
            <Route index element={<IndexOne />} />
            <Route path="indextwo" element={<IndexTwo />} />
            <Route path="indexthree" element={<IndexThree />} />
            <Route path="indexfour" element={<IndexFour />} />
            <Route path="indexfive" element={<IndexFive />} />
            <Route path="indexsix" element={<IndexSix />} />
            <Route path="/pages">
                <Route path="auths">
                  <Route path="auth-success" element={<Success />}></Route>
                  <Route path="auth-reset" element={<ForgotPassword />}></Route>
                  <Route path="auth-register" element={<Register />}></Route>
                  <Route path="auth-login" element={<Login />}></Route>
                </Route>
                <Route path="errors">
                  <Route path="404-modern" element={<Error404Modern />}></Route>
                  <Route path="404-classic" element={<Error404Classic />}></Route>
                  <Route path="504-modern" element={<Error504Modern />}></Route>
                  <Route path="504-classic" element={<Error504Classic />}></Route>
                </Route>
            </Route>
            <Route path="*" element={<Error404Modern />}></Route>
          </Routes>
        </BrowserRouter>
      </div>
    </Suspense>
  );
}

export default App;
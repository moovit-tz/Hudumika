<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>Limitless - Responsive Web Application Kit by Themesbrand</title>

    <!-- Global stylesheets -->
    <link href="{{URL::asset('assets/fonts/inter/inter.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/icons/phosphor/styles.min.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/css/all.min.css')}}" id="stylesheet" rel="stylesheet" type="text/css">
    <!-- /global stylesheets -->

    <!-- Core JS files -->
    <script src="{{URL::asset('assets/demo/demo_configurator.js')}}"></script>
    <script src="{{URL::asset('assets/js/bootstrap/bootstrap.bundle.min.js')}}"></script>
    <!-- /core JS files -->

    <!-- Theme JS files -->
    <script src="{{URL::asset('assets/js/vendor/ui/prism.min.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    <!-- Page content -->
    <div class="page-content">

        @include('layouts.sidebar')

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Inner content -->
            <div class="content-inner">

                <!-- Page header -->
                <div class="page-header page-header-light page-header-static border-bottom">
                    <div class="page-header-content d-lg-flex">
                        <div class="d-flex">
                            <h4 class="page-title mb-0">
                                Single Navbar - <span class="fw-normal">After Header Sticky</span>
                            </h4>

                            <a href="#page_header" class="btn btn-light align-self-center collapsed d-lg-none border-transparent rounded-pill p-0 ms-auto" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator ph-sm m-1"></i>
                            </a>
                        </div>

                        <div class="collapse d-lg-block my-lg-auto ms-lg-auto" id="page_header">
                            <div class="d-sm-flex align-items-center mb-3 mb-lg-0 ms-lg-3">
                                <div class="d-inline-flex align-items-center">
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('/assets/images/demo/users/face24.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-warning"></span>
                                    </a>
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('/assets/images/demo/users/face1.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-success"></span>
                                    </a>
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('/assets/images/demo/users/face3.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-danger"></span>
                                    </a>
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('/assets/images/demo/users/face5.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-success"></span>
                                    </a>

                                    <div class="vr flex-shrink-0 my-1 mx-3"></div>

                                    <a href="#" class="btn btn-primary btn-icon w-32px h-32px rounded-pill">
                                        <i class="ph-plus"></i>
                                    </a>

                                    <div class="dropdown ms-2">
                                        <a href="#" class="btn btn-light btn-icon w-32px h-32px rounded-pill" data-bs-toggle="dropdown">
                                            <i class="ph-dots-three-vertical"></i>
                                        </a>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <button type="button" class="dropdown-item">
                                                <i class="ph-briefcase me-2"></i>
                                                Customer details
                                            </button>
                                            <button type="button" class="dropdown-item">
                                                <i class="ph-folder-user me-2"></i>
                                                User directory
                                            </button>
                                            <button type="button" class="dropdown-item">
                                                <i class="ph-user-gear me-2"></i>
                                                Permissions
                                            </button>
                                            <div class="dropdown-divider"></div>
                                            <button type="button" class="dropdown-item">
                                                <i class="ph-users-four me-2"></i>
                                                Manage users
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /page header -->

                <!-- Main navbar -->
                <div class="navbar navbar-expand-lg sticky-top shadow">
                    <div class="container-fluid">
                        <div class="d-flex d-lg-none me-2">
                            <button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded-pill">
                                <i class="ph-list"></i>
                            </button>
                        </div>

                        <div class="navbar-collapse flex-lg-1 order-2 order-lg-1 collapse" id="navbar_search">
                            <div class="navbar-search flex-fill dropdown mt-2 mt-lg-0">
                                <div class="form-control-feedback form-control-feedback-start flex-grow-1">
                                    <input type="text" class="form-control" placeholder="Search" data-bs-toggle="dropdown">
                                    <div class="form-control-feedback-icon">
                                        <i class="ph-magnifying-glass"></i>
                                    </div>
                                    <div class="dropdown-menu w-100">
                                        <button type="button" class="dropdown-item">
                                            <div class="text-center w-32px me-3">
                                                <i class="ph-magnifying-glass"></i>
                                            </div>
                                            <span>Search <span class="fw-bold">"in"</span> everywhere</span>
                                        </button>

                                        <div class="dropdown-divider"></div>

                                        <div class="dropdown-menu-scrollable-lg">
                                            <div class="dropdown-header">
                                                Contacts
                                                <a href="#" class="float-end">
                                                    See all
                                                    <i class="ph-arrow-circle-right ms-1"></i>
                                                </a>
                                            </div>

                                            <div class="dropdown-item cursor-pointer">
                                                <div class="me-3">
                                                    <img src="{{URL::asset('/assets/images/demo/users/face3.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                                </div>

                                                <div class="d-flex flex-column flex-grow-1">
                                                    <div class="fw-semibold">Christ<mark>in</mark>e Johnson</div>
                                                    <span class="fs-sm text-muted">c.johnson@awesomecorp.com</span>
                                                </div>

                                                <div class="d-inline-flex">
                                                    <a href="#" class="text-body ms-2">
                                                        <i class="ph-user-circle"></i>
                                                    </a>
                                                </div>
                                            </div>

                                            <div class="dropdown-item cursor-pointer">
                                                <div class="me-3">
                                                    <img src="{{URL::asset('/assets/images/demo/users/face24.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                                </div>

                                                <div class="d-flex flex-column flex-grow-1">
                                                    <div class="fw-semibold">Cl<mark>in</mark>ton Sparks</div>
                                                    <span class="fs-sm text-muted">c.sparks@awesomecorp.com</span>
                                                </div>

                                                <div class="d-inline-flex">
                                                    <a href="#" class="text-body ms-2">
                                                        <i class="ph-user-circle"></i>
                                                    </a>
                                                </div>
                                            </div>

                                            <div class="dropdown-divider"></div>

                                            <div class="dropdown-header">
                                                Clients
                                                <a href="#" class="float-end">
                                                    See all
                                                    <i class="ph-arrow-circle-right ms-1"></i>
                                                </a>
                                            </div>

                                            <div class="dropdown-item cursor-pointer">
                                                <div class="me-3">
                                                    <img src="{{URL::asset('/assets/images/brands/adobe.svg')}}" class="w-32px h-32px rounded-pill" alt="">
                                                </div>

                                                <div class="d-flex flex-column flex-grow-1">
                                                    <div class="fw-semibold">Adobe <mark>In</mark>c.</div>
                                                    <span class="fs-sm text-muted">Enterprise license</span>
                                                </div>

                                                <div class="d-inline-flex">
                                                    <a href="#" class="text-body ms-2">
                                                        <i class="ph-briefcase"></i>
                                                    </a>
                                                </div>
                                            </div>

                                            <div class="dropdown-item cursor-pointer">
                                                <div class="me-3">
                                                    <img src="{{URL::asset('/assets/images/brands/holiday-inn.svg')}}" class="w-32px h-32px rounded-pill" alt="">
                                                </div>

                                                <div class="d-flex flex-column flex-grow-1">
                                                    <div class="fw-semibold">Holiday-<mark>In</mark>n</div>
                                                    <span class="fs-sm text-muted">On-premise license</span>
                                                </div>

                                                <div class="d-inline-flex">
                                                    <a href="#" class="text-body ms-2">
                                                        <i class="ph-briefcase"></i>
                                                    </a>
                                                </div>
                                            </div>

                                            <div class="dropdown-item cursor-pointer">
                                                <div class="me-3">
                                                    <img src="{{URL::asset('/assets/images/brands/ing.svg')}}" class="w-32px h-32px rounded-pill" alt="">
                                                </div>

                                                <div class="d-flex flex-column flex-grow-1">
                                                    <div class="fw-semibold"><mark>IN</mark>G Group</div>
                                                    <span class="fs-sm text-muted">Perpetual license</span>
                                                </div>

                                                <div class="d-inline-flex">
                                                    <a href="#" class="text-body ms-2">
                                                        <i class="ph-briefcase"></i>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="position-static">
                                    <a href="#" class="navbar-nav-link align-items-center justify-content-center w-40px h-32px position-absolute end-0 top-50 translate-middle-y p-0 me-1" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                                        <i class="ph-faders-horizontal"></i>
                                    </a>

                                    <div class="dropdown-menu w-100 p-3">
                                        <div class="d-flex align-items-center mb-3">
                                            <h6 class="mb-0">Search options</h6>
                                            <a href="#" class="text-body rounded-pill ms-auto">
                                                <i class="ph-clock-counter-clockwise"></i>
                                            </a>
                                        </div>

                                        <div class="mb-3">
                                            <label class="d-block form-label">Category</label>
                                            <label class="form-check form-check-inline">
                                                <input type="checkbox" class="form-check-input" checked>
                                                <span class="form-check-label">Invoices</span>
                                            </label>
                                            <label class="form-check form-check-inline">
                                                <input type="checkbox" class="form-check-input">
                                                <span class="form-check-label">Files</span>
                                            </label>
                                            <label class="form-check form-check-inline">
                                                <input type="checkbox" class="form-check-input">
                                                <span class="form-check-label">Users</span>
                                            </label>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Addition</label>
                                            <div class="input-group">
                                                <select class="form-select w-auto flex-grow-0">
                                                    <option value="1" selected>has</option>
                                                    <option value="2">has not</option>
                                                </select>
                                                <input type="text" class="form-control" placeholder="Enter the word(s)">
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Status</label>
                                            <div class="input-group">
                                                <select class="form-select w-auto flex-grow-0">
                                                    <option value="1" selected>is</option>
                                                    <option value="2">is not</option>
                                                </select>
                                                <select class="form-select">
                                                    <option value="1" selected>Active</option>
                                                    <option value="2">Inactive</option>
                                                    <option value="3">New</option>
                                                    <option value="4">Expired</option>
                                                    <option value="5">Pending</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="d-flex">
                                            <button type="button" class="btn btn-light">Reset</button>

                                            <div class="ms-auto">
                                                <button type="button" class="btn btn-light">Cancel</button>
                                                <button type="button" class="btn btn-primary ms-2">Apply</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ul class="nav hstack gap-sm-1 flex-row justify-content-end order-1 order-lg-2">
                            <li class="nav-item d-lg-none">
                                <a href="#navbar_search" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="collapse">
                                    <i class="ph-magnifying-glass"></i>
                                </a>
                            </li>

                            <li class="nav-item nav-item-dropdown-lg dropdown">
                                <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown">
                                    <i class="ph-squares-four"></i>
                                </a>

                                <div class="dropdown-menu dropdown-menu-end dropdown-menu-scrollable-sm wmin-lg-600 p-0">
                                    <div class="d-flex align-items-center border-bottom p-3">
                                        <h6 class="mb-0">Browse apps</h6>
                                        <a href="#" class="ms-auto">
                                            View all
                                            <i class="ph-arrow-circle-right ms-1"></i>
                                        </a>
                                    </div>

                                    <div class="row row-cols-1 row-cols-sm-2 g-0">
                                        <div class="col">
                                            <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom p-3">
                                                <div>
                                                    <img src="{{URL::asset('/assets/images/demo/logos/1.svg')}}" class="h-40px mb-2" alt="">
                                                    <div class="fw-semibold my-1">Customer data platform</div>
                                                    <div class="text-muted">Unify customer data from multiple sources</div>
                                                </div>
                                            </button>
                                        </div>

                                        <div class="col">
                                            <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-bottom p-3">
                                                <div>
                                                    <img src="{{URL::asset('/assets/images/demo/logos/2.svg')}}" class="h-40px mb-2" alt="">
                                                    <div class="fw-semibold my-1">Data catalog</div>
                                                    <div class="text-muted">Discover, inventory, and organize data assets</div>
                                                </div>
                                            </button>
                                        </div>

                                        <div class="col">
                                            <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom border-bottom-sm-0 rounded-bottom-start p-3">
                                                <div>
                                                    <img src="{{URL::asset('/assets/images/demo/logos/3.svg')}}" class="h-40px mb-2" alt="">
                                                    <div class="fw-semibold my-1">Data governance</div>
                                                    <div class="text-muted">The collaboration hub and data marketplace</div>
                                                </div>
                                            </button>
                                        </div>

                                        <div class="col">
                                            <button type="button" class="dropdown-item text-wrap h-100 align-items-start rounded-bottom-end p-3">
                                                <div>
                                                    <img src="{{URL::asset('/assets/images/demo/logos/4.svg')}}" class="h-40px mb-2" alt="">
                                                    <div class="fw-semibold my-1">Data privacy</div>
                                                    <div class="text-muted">Automated provisioning of non-production datasets</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </li>

                            <li class="nav-item">
                                <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="offcanvas" data-bs-target="#notifications">
                                    <i class="ph-bell"></i>
                                    <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                                </a>
                            </li>

                            <li class="nav-item nav-item-dropdown-lg dropdown">
                                <a href="#" class="navbar-nav-link align-items-center rounded-pill p-1" data-bs-toggle="dropdown">
                                    <div class="status-indicator-container">
                                        <img src="{{URL::asset('/assets/images/demo/users/face11.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-success"></span>
                                    </div>
                                    <span class="d-none d-lg-inline-block mx-lg-2">Victoria</span>
                                </a>

                                <div class="dropdown-menu dropdown-menu-end">
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-user-circle me-2"></i>
                                        My profile
                                    </a>
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-currency-circle-dollar me-2"></i>
                                        My subscription
                                    </a>
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-shopping-cart me-2"></i>
                                        My orders
                                    </a>
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-envelope-open me-2"></i>
                                        My inbox
                                        <span class="badge bg-primary rounded-pill ms-auto">26</span>
                                    </a>
                                    <div class="dropdown-divider"></div>
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-gear me-2"></i>
                                        Account settings
                                    </a>
                                    <a href="#" class="dropdown-item">
                                        <i class="ph-sign-out me-2"></i>
                                        Logout
                                    </a>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
                <!-- /main navbar -->

                <!-- Content area -->
                <div class="content">

                    <!-- Info alert -->
                    <div class="alert alert-success alert-dismissible">
                        <div class="alert-heading fw-semibold">Sticky navbar</div>
                        This option works with any navbar that is placed in <code>.content</code> container. To make it sticky, just add <code>.sticky-top</code> or <code>.sticky-bottom</code> class to the navbar container.
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                    <!-- /info alert -->


                    <!-- Navbar component -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Navbar component</h5>
                        </div>

                        <div class="card-body">
                            <p class="mb-3">Navbar is a navigation component, usually displayed on top of the page and includes brand logo, navigation, notifications, user menu, language switcher and other components. By default, navbar has <code>top fixed</code> position and is a direct child of <code>&lt;body></code> container. Navbar toggler appears next to the brand logo on small screens and can be easily adjusted with <code>display</code> utility classes. You can also control responsive collapsing breakpoint directly in the markup. Navbar component is responsive by default and requires <code>.navbar</code> and <code>.navbar-expand{-sm|-md|-lg|-xl|-xxl}</code> classes. Main navigation bar also has static position, but due to the nature of the general layout, it's moved outside all scrolable containers so that it always appears to be sticked to the top.</p>

                            <div class="mb-4">
                                <h6>Static navbars</h6>
                                <p class="mb-3">By default, top and bottom navbars in content area have <code>static</code> position and scroll away along with content. This use case doesn't require any additional classes for <code>.navbar</code> and <code>&lt;body></code> containers, this means navbar appearance depends on its placement: in the template top static navbar is the first direct child of <code>.content-inner</code> or <code>.content</code> containers.</p>

                                <div class="rounded overflow-auto border p-1" style="max-height: 275px;">
                                    <div class="navbar navbar-dark navbar-expand-xl rounded">
                                        <div class="container-fluid">
                                            <div class="navbar-brand">
                                                <a href="index" class="d-inline-flex align-items-center">
                                                    <img src="{{URL::asset('/assets/images/logo_icon.svg')}}" alt="">
                                                    <h4 class="d-none d-sm-inline-block text-white lh-1 mb-0 ms-3">Limitless</h4>
                                                </a>
                                            </div>

                                            <div class="d-xl-none ms-2">
                                                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-demo1-mobile">
                                                    <i class="ph-squares-four"></i>
                                                </button>
                                            </div>

                                            <div class="navbar-collapse collapse order-2 order-xl-1" id="navbar-demo1-mobile">
                                                <ul class="navbar-nav mt-2 mt-xl-0">
                                                    <li class="nav-item">
                                                        <a href="#" class="navbar-nav-link rounded">Link</a>
                                                    </li>
                                                    <li class="nav-item dropdown">
                                                        <a href="#" class="navbar-nav-link rounded dropdown-toggle" data-bs-toggle="dropdown">Dropdown</a>
                                                        <div class="dropdown-menu">
                                                            <a href="#" class="dropdown-item">Action</a>
                                                            <a href="#" class="dropdown-item">Another action</a>
                                                            <a href="#" class="dropdown-item">Something else here</a>
                                                            <a href="#" class="dropdown-item">One more line</a>
                                                        </div>
                                                    </li>
                                                </ul>
                                            </div>

                                            <ul class="navbar-nav flex-row order-1 order-xl-2 ms-auto">
                                                <li class="nav-item">
                                                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                                                        <i class="ph-bell"></i>
                                                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                                                    </a>
                                                </li>
                                                <li class="nav-item">
                                                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded ms-xl-2">
                                                        <i class="ph-chats"></i>
                                                    </a>
                                                </li>
                                                <li class="nav-item nav-item-dropdown-xl dropdown ms-xl-2">
                                                    <a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
                                                        <div class="status-indicator-container">
                                                            <img src="{{URL::asset('/assets/images/demo/users/face11.jpg')}}" class="w-32px h-32px rounded" alt="">
                                                            <span class="status-indicator bg-success"></span>
                                                        </div>
                                                        <span class="d-none d-xl-inline-block mx-xl-2">Victoria</span>
                                                    </a>

                                                    <div class="dropdown-menu dropdown-menu-end">
                                                        <a href="#" class="dropdown-item">Action</a>
                                                        <a href="#" class="dropdown-item">Another action</a>
                                                        <a href="#" class="dropdown-item">Something else here</a>
                                                        <a href="#" class="dropdown-item">One more line</a>
                                                    </div>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div class="px-3 pt-2">
                                        <div class="row">
                                            <div class="col-12">
                                                <div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-pink bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-success bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-success bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-info bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-7">
                                                <div class="bg-secondary bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-2">
                                                <div class="bg-success bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="navbar navbar-expand-xl border rounded">
                                        <div class="container-fluid flex-column flex-sm-row">
                                            <span class="my-2">© 2022 <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328">Limitless Web App Kit</a></span>

                                            <ul class="nav">
                                                <li class="nav-item">
                                                    <a href="https://kopyov.ticksy.com/" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-lifebuoy"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Support</span>
                                                        </div>
                                                    </a>
                                                </li>
                                                <li class="nav-item ms-md-1">
                                                    <a href="https://demo.interface.club/limitless/demo/Documentation/index.html" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-file-text"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Docs</span>
                                                        </div>
                                                    </a>
                                                </li>
                                                <li class="nav-item ms-md-1">
                                                    <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328?ref=kopyov" class="navbar-nav-link navbar-nav-link-icon text-primary bg-primary bg-opacity-10 fw-semibold rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-shopping-cart"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Purchase</span>
                                                        </div>
                                                    </a>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-4">
                                <h6>Fixed navbars</h6>
                                <p class="mb-3">Fixed navbars depend on location in containers. All navbars placed inside <code>.content-inner</code> container scroll away with the content. Once they are moved outside <code>.content-inner</code> container and placed before or after it, navbar becomes "fixed". It will push the content section up or down and will be always displayed within the viewport despite the scrolling position. None of these options requires any additional class names either in containers or navbar itself. Table below lists all available body and navbar classes.</p>

                                <div class="rounded-top border-top border-start border-end p-1">
                                    <div class="navbar navbar-dark navbar-expand-xl rounded">
                                        <div class="container-fluid">
                                            <div class="navbar-brand">
                                                <a href="index" class="d-inline-flex align-items-center">
                                                    <img src="{{URL::asset('/assets/images/logo_icon.svg')}}" alt="">
                                                    <h4 class="d-none d-sm-inline-block text-white lh-1 mb-0 ms-3">Limitless</h4>
                                                </a>
                                            </div>

                                            <div class="d-xl-none ms-2">
                                                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-demo3-mobile">
                                                    <i class="ph-squares-four"></i>
                                                </button>
                                            </div>

                                            <div class="navbar-collapse collapse order-2 order-xl-1" id="navbar-demo3-mobile">
                                                <ul class="navbar-nav mt-2 mt-xl-0">
                                                    <li class="nav-item">
                                                        <a href="#" class="navbar-nav-link rounded">Link</a>
                                                    </li>
                                                    <li class="nav-item dropdown">
                                                        <a href="#" class="navbar-nav-link rounded dropdown-toggle" data-bs-toggle="dropdown">Dropdown</a>
                                                        <div class="dropdown-menu">
                                                            <a href="#" class="dropdown-item">Action</a>
                                                            <a href="#" class="dropdown-item">Another action</a>
                                                            <a href="#" class="dropdown-item">Something else here</a>
                                                            <a href="#" class="dropdown-item">One more line</a>
                                                        </div>
                                                    </li>
                                                </ul>
                                            </div>

                                            <ul class="navbar-nav flex-row order-1 order-xl-2 ms-auto">
                                                <li class="nav-item">
                                                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                                                        <i class="ph-bell"></i>
                                                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                                                    </a>
                                                </li>
                                                <li class="nav-item">
                                                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded ms-xl-2">
                                                        <i class="ph-chats"></i>
                                                    </a>
                                                </li>
                                                <li class="nav-item nav-item-dropdown-xl dropdown ms-xl-2">
                                                    <a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
                                                        <div class="status-indicator-container">
                                                            <img src="{{URL::asset('/assets/images/demo/users/face11.jpg')}}" class="w-32px h-32px rounded" alt="">
                                                            <span class="status-indicator bg-success"></span>
                                                        </div>
                                                        <span class="d-none d-xl-inline-block mx-xl-2">Victoria</span>
                                                    </a>

                                                    <div class="dropdown-menu dropdown-menu-end">
                                                        <a href="#" class="dropdown-item">Action</a>
                                                        <a href="#" class="dropdown-item">Another action</a>
                                                        <a href="#" class="dropdown-item">Something else here</a>
                                                        <a href="#" class="dropdown-item">One more line</a>
                                                    </div>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <div class="overflow-auto border-start border-end p-1" style="max-height: 230px;">
                                    <div class="px-3 pt-2">
                                        <div class="row">
                                            <div class="col-12">
                                                <div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-pink bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-success bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-success bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-6">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-info bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-7">
                                                <div class="bg-secondary bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-2">
                                                <div class="bg-success bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-3">
                                                <div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-12">
                                                <div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
                                            </div>
                                            <div class="col-4">
                                                <div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                            <div class="col-8">
                                                <div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="rounded-bottom border-bottom border-start border-end p-1">
                                    <div class="navbar navbar-expand-xl border rounded">
                                        <div class="container-fluid flex-column flex-sm-row">
                                            <span class="my-2">© 2022 <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328">Limitless Web App Kit</a></span>

                                            <ul class="nav">
                                                <li class="nav-item">
                                                    <a href="https://kopyov.ticksy.com/" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-lifebuoy"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Support</span>
                                                        </div>
                                                    </a>
                                                </li>
                                                <li class="nav-item ms-md-1">
                                                    <a href="https://demo.interface.club/limitless/demo/Documentation/index.html" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-file-text"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Docs</span>
                                                        </div>
                                                    </a>
                                                </li>
                                                <li class="nav-item ms-md-1">
                                                    <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328?ref=kopyov" class="navbar-nav-link navbar-nav-link-icon text-primary bg-primary bg-opacity-10 fw-semibold rounded" target="_blank">
                                                        <div class="d-flex align-items-center mx-md-1">
                                                            <i class="ph-shopping-cart"></i>
                                                            <span class="d-none d-md-inline-block ms-2">Purchase</span>
                                                        </div>
                                                    </a>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <h6>Navbar markup</h6>
                            <p class="mb-3">Navbar markup consists of a set of containers with mandatory and optional classes: <code>.navbar</code> is a wrapper, this class is required for all types of navbars; <code>.navbar-[color]</code> - sets main background color theme and adjusts content color; <code>.navbar-expand-[breakpoint]</code> - responsible for collapsing navbar content behind the button on small screens. See the table below for a full list of classes.</p>

                            <div class="mb-3">
                                <p class="fw-semibold">Default navbar markup:</p>
                                <pre class="language-markup">
									<code>
										&lt;!-- Document body -->
										&lt;body>

											&lt;!-- Main navbar -->
											&lt;div class="navbar navbar-dark navbar-static navbar-expand-lg">
												&lt;div class="container-fluid">

													&lt;!-- Mobile togglers -->
													&lt;div class="d-flex d-lg-none me-2">
														...
													&lt;/div>
													&lt;!-- /mobile togglers -->


													&lt;!-- Navbar brand -->
													&lt;div class="d-inline-flex flex-1 flex-lg-0">
														&lt;a href="index.html" class="navbar-brand d-inline-flex align-items-center">
															...
														&lt;/a>
													&lt;/div>
													&lt;!-- /navbar brand -->


													&lt;!-- Left content -->
													&lt;div class="flex-row">
														...
													&lt;/div>
													&lt;!-- /left content -->


													&lt;!-- Collapsible navbar content (center) -->
													&lt;div class="navbar-collapse justify-content-center flex-lg-1 order-2 order-lg-1 collapse" id="navbar-mobile">
														...
													&lt;/div>
													&lt;!-- /collapsible navbar content (center) -->


													&lt;!-- Right content -->
													&lt;div class="flex-row justify-content-end order-1 order-lg-2">
														...
													&lt;/div>
													&lt;!-- /right content -->

												&lt;/div>
											&lt;/div>
											&lt;!-- /main navbar -->


											&lt;!-- Page content -->
											&lt;div class="page-content">
												...
											&lt;/div>
											&lt;!-- /page content -->

										&lt;/body>
										&lt;!-- /document body -->
									</code>
								</pre>
                            </div>

                            <div class="mb-3">
                                <p class="fw-semibold">Content navbar markup:</p>
                                <pre class="language-markup">
									<code>
										&lt;!-- Content navbar -->
										&lt;div class="navbar navbar-dark navbar-expand-xl navbar-static">
											&lt;div class="container-fluid">

												&lt;!-- Mobile toggler -->
												&lt;div class="text-center d-xl-none w-100">
													...
												&lt;/div>
												&lt;!-- /mobile toggler -->


												&lt;!-- Content collapsed on mobile -->
												&lt;div class="navbar-collapse collapse" id="navbar-demo3-mobile">
													...
												&lt;/div>
												&lt;!-- /content collapsed on mobile -->

											&lt;/div>
										&lt;/div>
										&lt;!-- /content navbar -->
									</code>
								</pre>
                            </div>
                        </div>
                    </div>
                    <!-- /navbar component -->


                    <!-- Navbar classes -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Navbar classes</h5>
                        </div>

                        <div class="card-body">
                            Navbar is a complex, but very flexible component. It supports different types of content, responsive utilities manage content appearance and spacing on various screen sizes, supports multiple sizing and color options etc. And everything can be changed on-the-fly directly in HTML markup. If you can't find an option you need, you can always extend default SCSS code. Table below demonstrates all available classes that can be used within the navbar:
                        </div>

                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th style="width: 20%;">Class</th>
                                        <th style="width: 20%;">Type</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><code>.navbar</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Default navbar class, must be used with any navbar type and color. Responsible for basic navbar and navbar components styling as a parent container.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-dark</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>This class is used for <code>dark</code> background colors - default dark color is set in <code>$navbar-dark-bg</code> variable, feel free to adjust the color according to your needs.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar.bg-*</code></td>
                                        <td><span class="text-muted">Optional</span></td>
                                        <td>Combination of these classes allows you to set custom <strong>light</strong> color to the default <code>light</code> navbar.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-dark.bg-*</code></td>
                                        <td><span class="text-muted">Optional</span></td>
                                        <td>Combination of these classes allows you to set custom <strong>dark</strong> color to the <code>dark</code> navbar. Note - <code>.navbar-dark</code> is required, it's responsible for correct content styling.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-expand-[breakpoint]</code></td>
                                        <td><span class="text-muted">Optional</span></td>
                                        <td>For navbars that never collapse, add the <code>.navbar-expand</code> class on the navbar. For navbars that always collapse, don’t add any <code>.navbar-expand</code> class. Otherwise use this class to change when navbar content collapses behind a button.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-brand</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Class for logo container. It can be applied to most elements, but an anchor works best as some elements might require utility classes or custom styles</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-toggler</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>This class needs to be added to the navbar toggle button that toggles navbar content on small screens. Always used with visibility utility classes.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-collapse</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Groups and hides navbar contents by a parent breakpoint. Requires an ID for targeting collapsible container when sidebar content is collapsed.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-nav</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Responsive navigation container class that adds default styling for navbar navigation.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.nav-item</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Wrapper class for immediate parents of all navigation links. Responsible for correct styling of nav items</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-nav-link</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>Custom class for links within <code>.nav</code> list, it sets proper styling for links in light and dark navbars.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-nav-link-icon</code></td>
                                        <td><span class="text-muted">Optional</span></td>
                                        <td>For navigation items that contain icon only. This class adjusts left and right paddings to make sure that proportions are preserved.</td>
                                    </tr>
                                    <tr>
                                        <td><code>.navbar-text</code></td>
                                        <td><span class="text-muted">Required</span></td>
                                        <td>This class adjusts vertical alignment and horizontal spacing for strings of text</td>
                                    </tr>
                                    <tr>
                                        <td><code>.sticky-top</code></td>
                                        <td><span class="text-muted">Optional</span></td>
                                        <td>Adds <code>position: sticky;</code> to the navbar - it's treated as relatively positioned until its containing block crosses a specified threshold, at which point it is treated as fixed. Support is limited.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <!-- /navbar classes -->

                </div>
                <!-- /content area -->

                @include('layouts.footer')

            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->


    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>

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

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body class="navbar-top">

    <!-- Main navbar -->
    <div class="navbar navbar-dark navbar-expand-lg navbar-slide-top fixed-top">
        <div class="container-fluid">
            <div class="d-flex d-lg-none me-2">
                <button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded-pill">
                    <i class="ph-list"></i>
                </button>
            </div>

            <div class="navbar-brand flex-1 flex-lg-0">
                <a href="index" class="d-inline-flex align-items-center">
                    <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                    <img src="{{URL::asset('assets/images/logo_text_light.svg')}}" class="d-none d-sm-inline-block h-16px ms-3" alt="">
                </a>
            </div>

            <ul class="nav flex-row">
                <li class="nav-item d-lg-none">
                    <a href="#navbar_search" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="collapse">
                        <i class="ph-magnifying-glass"></i>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-lg dropdown">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown">
                        <i class="ph-squares-four"></i>
                    </a>

                    <div class="dropdown-menu dropdown-menu-scrollable-sm wmin-lg-600 p-0">
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
                                        <img src="{{URL::asset('assets/images/demo/logos/1.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Customer data platform</div>
                                        <div class="text-muted">Unify customer data from multiple sources</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-bottom p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/2.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data catalog</div>
                                        <div class="text-muted">Discover, inventory, and organize data assets</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom border-bottom-sm-0 rounded-bottom-start p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/3.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data governance</div>
                                        <div class="text-muted">The collaboration hub and data marketplace</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start rounded-bottom-end p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/4.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data privacy</div>
                                        <div class="text-muted">Automated provisioning of non-production datasets</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </li>

                <li class="nav-item nav-item-dropdown-lg dropdown ms-lg-2">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                        <i class="ph-chats"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">8</span>
                    </a>

                    <div class="dropdown-menu wmin-lg-400 p-0">
                        <div class="d-flex align-items-center p-3">
                            <h6 class="mb-0">Messages</h6>
                            <div class="ms-auto">
                                <a href="#" class="text-body">
                                    <i class="ph-plus-circle"></i>
                                </a>
                                <a href="#search_messages" class="collapsed text-body ms-2" data-bs-toggle="collapse">
                                    <i class="ph-magnifying-glass"></i>
                                </a>
                            </div>
                        </div>

                        <div class="collapse" id="search_messages">
                            <div class="px-3 mb-2">
                                <div class="form-control-feedback form-control-feedback-start">
                                    <input type="text" class="form-control" placeholder="Search messages">
                                    <div class="form-control-feedback-icon">
                                        <i class="ph-magnifying-glass"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="dropdown-menu-scrollable pb-2">
                            <a href="#" class="dropdown-item align-items-start text-wrap py-2">
                                <div class="status-indicator-container me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face10.jpg')}}" class="w-40px h-40px rounded-pill" alt="">
                                    <span class="status-indicator bg-warning"></span>
                                </div>

                                <div class="flex-1">
                                    <span class="fw-semibold">James Alexander</span>
                                    <span class="text-muted float-end fs-sm">04:58</span>
                                    <div class="text-muted">who knows, maybe that would be the best thing for me...</div>
                                </div>
                            </a>

                            <a href="#" class="dropdown-item align-items-start text-wrap py-2">
                                <div class="status-indicator-container me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face3.jpg')}}" class="w-40px h-40px rounded-pill" alt="">
                                    <span class="status-indicator bg-success"></span>
                                </div>

                                <div class="flex-1">
                                    <span class="fw-semibold">Margo Baker</span>
                                    <span class="text-muted float-end fs-sm">12:16</span>
                                    <div class="text-muted">That was something he was unable to do because...</div>
                                </div>
                            </a>

                            <a href="#" class="dropdown-item align-items-start text-wrap py-2">
                                <div class="status-indicator-container me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face24.jpg')}}" class="w-40px h-40px rounded-pill" alt="">
                                    <span class="status-indicator bg-success"></span>
                                </div>
                                <div class="flex-1">
                                    <span class="fw-semibold">Jeremy Victorino</span>
                                    <span class="text-muted float-end fs-sm">22:48</span>
                                    <div class="text-muted">But that would be extremely strained and suspicious...</div>
                                </div>
                            </a>

                            <a href="#" class="dropdown-item align-items-start text-wrap py-2">
                                <div class="status-indicator-container me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face4.jpg')}}" class="w-40px h-40px rounded-pill" alt="">
                                    <span class="status-indicator bg-grey"></span>
                                </div>
                                <div class="flex-1">
                                    <span class="fw-semibold">Beatrix Diaz</span>
                                    <span class="text-muted float-end fs-sm">Tue</span>
                                    <div class="text-muted">What a strenuous career it is that I've chosen...</div>
                                </div>
                            </a>

                            <a href="#" class="dropdown-item align-items-start text-wrap py-2">
                                <div class="status-indicator-container me-3">
                                    <img src="{{URL::asset('assets/images/demo/users/face25.jpg')}}" class="w-40px h-40px rounded-pill" alt="">
                                    <span class="status-indicator bg-danger"></span>
                                </div>
                                <div class="flex-1">
                                    <span class="fw-semibold">Richard Vango</span>
                                    <span class="text-muted float-end fs-sm">Mon</span>
                                    <div class="text-muted">Other travelling salesmen live a life of luxury...</div>
                                </div>
                            </a>
                        </div>

                        <div class="d-flex border-top py-2 px-3">
                            <a href="#" class="text-body">
                                <i class="ph-checks me-1"></i>
                                Dismiss all
                            </a>
                            <a href="#" class="text-body ms-auto">
                                View all
                                <i class="ph-arrow-circle-right ms-1"></i>
                            </a>
                        </div>
                    </div>
                </li>
            </ul>

            <div class="navbar-collapse justify-content-center flex-lg-1 order-2 order-lg-1 collapse" id="navbar_search">
                <div class="navbar-search flex-fill position-relative mt-2 mt-lg-0 mx-lg-3">
                    <div class="form-control-feedback form-control-feedback-start flex-grow-1" data-color-theme="dark">
                        <input type="text" class="form-control bg-transparent rounded-pill" placeholder="Search" data-bs-toggle="dropdown">
                        <div class="form-control-feedback-icon">
                            <i class="ph-magnifying-glass"></i>
                        </div>
                        <div class="dropdown-menu w-100" data-color-theme="light">
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
                                        <img src="{{URL::asset('assets/images/demo/users/face3.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
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
                                        <img src="{{URL::asset('assets/images/demo/users/face24.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
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
                                        <img src="{{URL::asset('assets/images/brands/adobe.svg')}}" class="w-32px h-32px rounded-pill" alt="">
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
                                        <img src="{{URL::asset('assets/images/brands/holiday-inn.svg')}}" class="w-32px h-32px rounded-pill" alt="">
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
                                        <img src="{{URL::asset('assets/images/brands/ing.svg')}}" class="w-32px h-32px rounded-pill" alt="">
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

                    <div>
                        <a href="#" class="navbar-nav-link align-items-center justify-content-center w-40px h-32px rounded-pill position-absolute end-0 top-50 translate-middle-y p-0 me-1" data-bs-toggle="dropdown" data-bs-auto-close="outside">
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

            <ul class="nav flex-row justify-content-end order-1 order-lg-2">
                <li class="nav-item ms-lg-2">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="offcanvas" data-bs-target="#notifications">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-lg dropdown ms-lg-2">
                    <a href="#" class="navbar-nav-link align-items-center rounded-pill p-1" data-bs-toggle="dropdown">
                        <div class="status-indicator-container">
                            <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-lg-inline-block mx-lg-2">{{Auth::user()->name}}</span>
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
                        <a class="dropdown-item" href="{{ route('logout') }}" onclick="event.preventDefault();
                                                     document.getElementById('logout-form').submit();">
                            <i class="ph-sign-out me-2"></i> {{ __('Logout') }}
                        </a>

                        <form id="logout-form" action="{{ route('logout') }}" method="POST" class="d-none">
                            @csrf
                        </form>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <!-- /main navbar -->

    @include('components.breadcrumb')

    @component('components.page-header')
    @slot('title') Seed @endslot
    @slot('subtitle') Hideable Navbar @endslot
    @endcomponent

    <!-- Page content -->
    <div class="page-content pt-0">

        @include('layouts.sidebar')

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Content area -->
            <div class="content">

                <!-- Basic card -->
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Basic card</h5>
                    </div>

                    <div class="card-body">
                        <h6>Start your development with no hassle!</h6>
                        <p class="mb-3">Common problem of templates is that all code is deeply integrated into the core. This limits your freedom in decreasing amount of code, i.e. it becomes pretty difficult to remove unnecessary code from the project. Limitless allows you to remove unnecessary and extra code easily just by disabling styling of certain components in <code>_config.scss</code>. Styling of all 3rd party components are stored in separate SCSS files that begin with <code>$enable-[component]</code> condition, which checks if this component is enabled in SCSS configuration and either includes or excludes it from bundled CSS file. Use only components you actually need!</p>

                        <h6>What is this?</h6>
                        <p class="mb-3">Starter kit is a set of pages, useful for developers to start development process from scratch. Each layout includes base components only: layout, page kits, color system which is still optional, bootstrap files and bootstrap overrides. No extra CSS/JS files and markup. CSS files are compiled without any plugins or components. Starter kit is moved to a separate folder for better accessibility.</p>

                        <h6>How does it work?</h6>
                        <p>You open one of the starter pages, add necessary plugins, enable components in <code>_config.scss</code> file, compile new CSS. That's it. It's also recommended to open one of main pages with functionality you need and copy all paths/JS code from there to your new page, if you don't need to change file structure.</p>
                    </div>
                </div>
                <!-- /basic card -->


                <!-- Basic table -->
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Basic table</h5>
                    </div>

                    <div class="card-body">
                        Seed project includes the most basic components that can help you in development process - basic grid example, card, table and form layouts with standard components. Nothing extra. Easily turn on and off styles of different components to keep your CSS as clean as possible. Bootstrap components are always enabled.
                    </div>

                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>First Name</th>
                                    <th>Last Name</th>
                                    <th>Username</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>1</td>
                                    <td>Eugene</td>
                                    <td>Kopyov</td>
                                    <td>@Kopyov</td>
                                </tr>
                                <tr>
                                    <td>2</td>
                                    <td>Victoria</td>
                                    <td>Baker</td>
                                    <td>@Vicky</td>
                                </tr>
                                <tr>
                                    <td>3</td>
                                    <td>James</td>
                                    <td>Alexander</td>
                                    <td>@Alex</td>
                                </tr>
                                <tr>
                                    <td>4</td>
                                    <td>Franklin</td>
                                    <td>Morrison</td>
                                    <td>@Frank</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <!-- /basic table -->


                <!-- Form layouts -->
                <div class="row">
                    <div class="col-lg-6">

                        <!-- Horizontal form -->
                        <div class="card">
                            <div class="card-header d-flex align-items-center">
                                <h5 class="mb-0">Horizontal form</h5>
                                <div class="hstack gap-2 ms-auto">
                                    <a class="text-body" data-card-action="collapse">
                                        <i class="ph-caret-down"></i>
                                    </a>
                                    <a class="text-body" data-card-action="reload">
                                        <i class="ph-arrows-clockwise"></i>
                                    </a>
                                    <a class="text-body" data-card-action="remove">
                                        <i class="ph-x"></i>
                                    </a>
                                </div>
                            </div>

                            <div class="collapse show">
                                <div class="card-body">
                                    <form action="#">
                                        <div class="row mb-3">
                                            <label class="col-lg-3 col-form-label">Text input</label>
                                            <div class="col-lg-9">
                                                <input type="text" class="form-control" placeholder="Text input">
                                            </div>
                                        </div>

                                        <div class="row mb-3">
                                            <label class="col-lg-3 col-form-label">Password</label>
                                            <div class="col-lg-9">
                                                <input type="password" class="form-control" placeholder="Password input">
                                            </div>
                                        </div>

                                        <div class="row mb-3">
                                            <label class="col-lg-3 col-form-label">Select</label>
                                            <div class="col-lg-9">
                                                <select name="select" class="form-select">
                                                    <option value="opt1">Basic select</option>
                                                    <option value="opt2">Option 2</option>
                                                    <option value="opt3">Option 3</option>
                                                    <option value="opt4">Option 4</option>
                                                    <option value="opt5">Option 5</option>
                                                    <option value="opt6">Option 6</option>
                                                    <option value="opt7">Option 7</option>
                                                    <option value="opt8">Option 8</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="row mb-3">
                                            <label class="col-lg-3 col-form-label">Textarea</label>
                                            <div class="col-lg-9">
                                                <textarea rows="5" cols="5" class="form-control" placeholder="Default textarea"></textarea>
                                            </div>
                                        </div>

                                        <div class="text-end">
                                            <button type="submit" class="btn btn-primary">Submit form <i class="ph-paper-plane-tilt ms-2"></i></button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <!-- /horizotal form -->

                    </div>

                    <div class="col-lg-6">

                        <!-- Vertical form -->
                        <div class="card">
                            <div class="card-header d-flex align-items-center">
                                <h5 class="mb-0">Vertical form</h5>
                                <div class="hstack gap-2 ms-auto">
                                    <a class="text-body" data-card-action="collapse">
                                        <i class="ph-caret-down"></i>
                                    </a>
                                    <a class="text-body" data-card-action="reload">
                                        <i class="ph-arrows-clockwise"></i>
                                    </a>
                                    <a class="text-body" data-card-action="remove">
                                        <i class="ph-x"></i>
                                    </a>
                                </div>
                            </div>

                            <div class="collapse show">
                                <div class="card-body">
                                    <form action="#">
                                        <div class="mb-3">
                                            <label class="form-label">Text input</label>
                                            <input type="text" class="form-control" placeholder="Text input">
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Select</label>
                                            <select name="select" class="form-select">
                                                <option value="opt1">Basic select</option>
                                                <option value="opt2">Option 2</option>
                                                <option value="opt3">Option 3</option>
                                                <option value="opt4">Option 4</option>
                                                <option value="opt5">Option 5</option>
                                                <option value="opt6">Option 6</option>
                                                <option value="opt7">Option 7</option>
                                                <option value="opt8">Option 8</option>
                                            </select>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Textarea</label>
                                            <textarea rows="4" cols="4" class="form-control" placeholder="Default textarea"></textarea>
                                        </div>

                                        <div class="text-end">
                                            <button type="submit" class="btn btn-primary">Submit form <i class="ph-paper-plane-tilt ms-2"></i></button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <!-- /vertical form -->

                    </div>
                </div>
                <!-- /form layouts -->

            </div>
            <!-- /content area -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->

    @include('layouts.footer')

    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>

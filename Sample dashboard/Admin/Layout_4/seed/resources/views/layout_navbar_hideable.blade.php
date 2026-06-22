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
    <script src="{{URL::asset('assets/js/vendor/ui/headroom.min.js')}}"></script>
    <script src="{{URL::asset('assets/js/vendor/visualization/d3/d3.min.js')}}"></script>
    <script src="{{URL::asset('assets/js/vendor/visualization/d3/d3_tooltip.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <script src="{{URL::asset('assets/demo/pages/navbar_hideable.js')}}"></script>
    <script src="{{URL::asset('assets/demo/pages/dashboard.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/streamgraph.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/sparklines.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/lines.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/areas.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/donuts.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/bars.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/progress.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/heatmaps.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/pies.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard/bullets.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body class="navbar-top">

    <!-- Main navbar -->
    <div class="navbar navbar-dark navbar-expand-lg navbar-slide-top fixed-top">
        <div class="container-fluid">
            <div class="d-flex d-lg-none">
                <button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded">
                    <i class="ph-list"></i>
                </button>
                <button type="button" class="navbar-toggler sidebar-mobile-secondary-toggle rounded">
                    <i class="ph-arrow-left"></i>
                </button>
            </div>

            <div class="navbar-brand flex-1 flex-lg-0 d-none d-sm-flex">
                <a href="index" class="d-inline-flex align-items-center">
                    <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                    <img src="{{URL::asset('assets/images/logo_text_light.svg')}}" class="d-none d-sm-inline-block h-16px ms-3" alt="">
                </a>
            </div>

            <div class="d-lg-none">
                <button class="navbar-toggler collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-mobile" aria-expanded="false">
                    <i class="ph-squares-four"></i>
                </button>
            </div>

            <div class="navbar-collapse order-2 order-lg-1 collapse" id="navbar-mobile" style="">
                <ul class="navbar-nav mt-2 mt-lg-0">
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

            <ul class="nav gap-sm-2 order-1 order-lg-2 ms-auto">
                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
                        <i class="ph-chats"></i>
                    </a>
                </li>
                <li class="nav-item nav-item-dropdown-lg dropdown">
                    <a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown" aria-expanded="false">
                        <div class="status-indicator-container">
                            <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-lg-inline-block mx-lg-2">{{Auth::user()->name}}</span>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end">
                        <a href="#" class="dropdown-item">Action</a>
                        <a href="#" class="dropdown-item">Another action</a>
                        <a href="#" class="dropdown-item">Something else here</a>
                        <a href="#" class="dropdown-item">One more line</a>
                        <a class="dropdown-item" href="{{ route('logout') }}" onclick="event.preventDefault();
	                                                     document.getElementById('logout-form').submit();">
                            {{ __('Logout') }}
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

    @include('layouts.navigation-menu')

    @component('components.page-header')
    @slot('subtitle') Hideable Navbar @endslot
    @endcomponent

    <!-- Page content -->
    <div class="page-content pt-0">

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
